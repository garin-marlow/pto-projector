import React, { useState, useMemo, useEffect, useRef } from 'react';

// Helper to format date as<y_bin_413>-MM-DD
const formatDate = (date) => {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper to parse 'YYYY-MM-DD' string back to a Date object reliably
const parseDateStr = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

    const d = new Date(year, month - 1, day);
    // Final check to ensure the date is valid (e.g., handles month 13, day 32)
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
        return d;
    }
    return null;
};


// --- Holiday Rules ---
// Holidays are defined as recurring rules (rather than fixed dates) so they
// automatically apply every year. Update this list with the official
// PunchThrough holiday schedule.
// TODO: Confirm/update this list with the official PunchThrough holidays.
const HOLIDAY_RULES = [
    { name: "New Year's Day", type: 'fixed', month: 1, day: 1 },
    { name: 'Martin Luther King, Jr. Day', type: 'nthWeekday', month: 1, weekday: 1, n: 3 }, // 3rd Monday of January
    { name: 'Memorial Day', type: 'lastWeekday', month: 5, weekday: 1 }, // Last Monday of May
    { name: 'Juneteenth', type: 'fixed', month: 6, day: 19 },
    { name: 'Independence Day', type: 'fixed', month: 7, day: 4 },
    { name: 'Labor Day', type: 'nthWeekday', month: 9, weekday: 1, n: 1 }, // 1st Monday of September
    { name: 'Thanksgiving', type: 'nthWeekday', month: 11, weekday: 4, n: 4 }, // 4th Thursday of November
    { name: 'Native American Heritage Day', type: 'nthWeekday', month: 11, weekday: 5, n: 4 }, // Day after Thanksgiving
    { name: 'Christmas Eve', type: 'fixed', month: 12, day: 24 },
    { name: 'Christmas Day', type: 'fixed', month: 12, day: 25 },
];

// Returns the Nth occurrence of `weekday` (0=Sun...6=Sat) in the given month/year.
const getNthWeekdayOfMonth = (year, month, weekday, n) => {
    const date = new Date(year, month - 1, 1);
    let count = 0;
    while (date.getMonth() === month - 1) {
        if (date.getDay() === weekday) {
            count++;
            if (count === n) return new Date(date);
        }
        date.setDate(date.getDate() + 1);
    }
    return null;
};

// Returns the last occurrence of `weekday` (0=Sun...6=Sat) in the given month/year.
const getLastWeekdayOfMonth = (year, month, weekday) => {
    const date = new Date(year, month, 0); // last day of the month
    while (date.getDay() !== weekday) {
        date.setDate(date.getDate() - 1);
    }
    return date;
};

// Resolves each holiday rule to a concrete { name, date } for a given year.
const generateHolidaysForYear = (year) => {
    const results = [];
    for (const rule of HOLIDAY_RULES) {
        let date = null;
        if (rule.type === 'fixed') {
            date = new Date(year, rule.month - 1, rule.day);
        } else if (rule.type === 'nthWeekday') {
            date = getNthWeekdayOfMonth(year, rule.month, rule.weekday, rule.n);
        } else if (rule.type === 'lastWeekday') {
            date = getLastWeekdayOfMonth(year, rule.month, rule.weekday);
        }
        if (date) {
            results.push({ name: rule.name, date });
        }
    }
    return results.sort((a, b) => a.date.getTime() - b.date.getTime());
};

// Builds a Set of 'YYYY-MM-DD' strings for every holiday across a range of years,
// so calendar navigation into past/future years reflects recurring holidays.
const generateHolidaySetForYearRange = (startYear, endYear) => {
    const set = new Set();
    for (let year = startYear; year <= endYear; year++) {
        for (const { date } of generateHolidaysForYear(year)) {
            set.add(formatDate(date));
        }
    }
    return set;
};


// --- Accrual Tiers ---
// Maps years of tenure at PunchThrough to PTO/Sick accrual rates (hours earned per
// hour worked) and the PTO max balance cap for that tier. Salary employees accrue
// the same annual total as Hourly (just paid out per pay period instead of per
// hour worked), so both use the same effective rate here. Sick accrual (1 hour
// per 30 hours worked) is the same across all tenures.
const ACCRUAL_TIERS = [
    { id: '0-2', label: '0-2 Years', ptoRatePerHour: (100 / 2081).toFixed(4), sickRatePerHour: (1 / 30).toFixed(4), maxPto: 150 },
    { id: '2-4', label: '2-4 Years', ptoRatePerHour: (140 / 2081).toFixed(4), sickRatePerHour: (1 / 30).toFixed(4), maxPto: 210 },
    { id: '4+', label: '4+ Years', ptoRatePerHour: (180 / 2081).toFixed(4), sickRatePerHour: (1 / 30).toFixed(4), maxPto: 270 },
];


// --- Persistence (localStorage) ---
// Saves/restores balances, rates, and selected dates so users don't need to
// re-enter everything each time they open the tool.
const STORAGE_KEY = 'pto-projector-state';

const loadStoredState = () => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
};


// --- Helper to calculate workdays ---
const calculateWorkdays = (startDate, endDate, holidays) => {
    let count = 0;
    const currentDate = new Date(startDate);
    
    while (currentDate < endDate) {
        const dayOfWeek = currentDate.getDay();
        const dateStr = formatDate(currentDate);
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.has(dateStr)) {
            count++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return count;
};


// --- Calendar Component ---
const Calendar = ({ selectedDates, onDateSelect, month, year, setMonth, setYear, holidays }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });

    const handleDateClick = (day) => {
        const date = new Date(year, month, day);
        if (date < today) return;
        onDateSelect(date);
    };

    const prevMonth = () => {
        if (month === 0) {
            setMonth(11);
            setYear(year - 1);
        } else {
            setMonth(month - 1);
        }
    };

    const nextMonth = () => {
        if (month === 11) {
            setMonth(0);
            setYear(year + 1);
        } else {
            setMonth(month + 1);
        }
    };
    
    const isWeekend = (day) => {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6;
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <button onClick={prevMonth} className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">&lt;</button>
                <h3 className="text-xl font-semibold text-gray-800">{monthName} {year}</h3>
                <button onClick={nextMonth} className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-2 text-center text-sm text-gray-500">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day}>{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-2 mt-2">
                {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`}></div>)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const date = new Date(year, month, day);
                    date.setHours(0,0,0,0);
                    const dateStr = formatDate(date);
                    const isSelected = selectedDates.has(dateStr);
                    const isPast = date < today;
                    const weekend = isWeekend(day);
                    const isHoliday = holidays.has(dateStr);

                    const baseClasses = "w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200";
                    let dayClasses = `${baseClasses}`;
                    
                    if (isPast) {
                        dayClasses += ' text-gray-400 cursor-not-allowed';
                    } else if (weekend) {
                        dayClasses += ' text-gray-400 bg-gray-100';
                    } else if (isHoliday) {
                        dayClasses += ' bg-green-200 text-green-800 font-semibold cursor-not-allowed';
                    }
                    else {
                        dayClasses += ' cursor-pointer';
                        if (isSelected) {
                            dayClasses += ' bg-blue-500 text-white font-bold shadow-md';
                        } else {
                            dayClasses += ' hover:bg-blue-100';
                        }
                    }

                    return (
                        <div key={day} className={dayClasses} onClick={() => !isPast && !weekend && !isHoliday && handleDateClick(day)}>
                            {day}
                        </div>
                    );
                })}
            </div>
             <div className="mt-4 flex items-center justify-center space-x-4 text-sm">
                <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded-full bg-green-200"></div><span>Holiday</span></div>
                <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded-full bg-blue-500"></div><span>Selected</span></div>
            </div>
        </div>
    );
};


// --- Main App Component ---
export default function App() {
    // Load any previously saved state once on mount (before state initialization).
    const storedStateRef = useRef(loadStoredState());
    const storedState = storedStateRef.current || {};

    // --- State Management ---
    const [currentPto, setCurrentPto] = useState(storedState.currentPto ?? "80");
    const [currentSick, setCurrentSick] = useState(storedState.currentSick ?? "40");
    const [ptoRatePerHour, setPtoRatePerHour] = useState(storedState.ptoRatePerHour ?? ACCRUAL_TIERS[0].ptoRatePerHour);
    const [sickRatePerHour, setSickRatePerHour] = useState(storedState.sickRatePerHour ?? ACCRUAL_TIERS[0].sickRatePerHour);
    const [selectedTier, setSelectedTier] = useState(storedState.selectedTier ?? ACCRUAL_TIERS[0].id);
    const [selectedDates, setSelectedDates] = useState(() => new Set(storedState.selectedDates ?? []));
    
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    // Calendar navigation state
    const [month, setMonth] = useState(today.getMonth());
    const [year, setYear] = useState(today.getFullYear());

    // Recurring holidays, generated for a wide range of years so navigating the
    // calendar into past/future years still reflects the correct holidays.
    const holidaySet = useMemo(
        () => generateHolidaySetForYearRange(today.getFullYear() - 1, today.getFullYear() + 10),
        [today]
    );

    const holidayList = useMemo(() => {
        return generateHolidaysForYear(today.getFullYear())
            .map(({ name, date }) => ({ name, label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }));
    }, [today]);

    // Persist balances, rates, and selected dates so users don't have to re-enter them.
    useEffect(() => {
        const stateToStore = {
            currentPto,
            currentSick,
            ptoRatePerHour,
            sickRatePerHour,
            selectedTier,
            selectedDates: Array.from(selectedDates),
        };
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToStore));
        } catch {
            // Ignore storage errors (e.g., private browsing with storage disabled)
        }
    }, [currentPto, currentSick, ptoRatePerHour, sickRatePerHour, selectedTier, selectedDates]);

    // --- Event Handlers ---
    const handleAccrualTierChange = (e) => {
        const tierId = e.target.value;
        setSelectedTier(tierId);
        const tier = ACCRUAL_TIERS.find(t => t.id === tierId);
        if (tier) {
            setPtoRatePerHour(tier.ptoRatePerHour);
            setSickRatePerHour(tier.sickRatePerHour);
        }
    };

    const handleDateSelect = (date) => {
        const dateStr = formatDate(date);
        if (!dateStr) return;

        setSelectedDates(prevSelectedDates => {
            const newSelectedDates = new Set(prevSelectedDates);
            if (newSelectedDates.has(dateStr)) {
                newSelectedDates.delete(dateStr);
            } else {
                newSelectedDates.add(dateStr);
            }
            return newSelectedDates;
        });
    };
    
    const handleClearSelection = () => {
        setSelectedDates(new Set());
    }

    // --- Derived State & Projections ---
    const sortedSelectedDates = useMemo(() => {
        return Array.from(selectedDates)
            .filter(dateStr => dateStr && typeof dateStr === 'string')
            .sort((a, b) => {
                const dateA = parseDateStr(a);
                const dateB = parseDateStr(b);
                if (!dateA || !dateB) return 0;
                return dateA.getTime() - dateB.getTime();
            });
    }, [selectedDates]);

    // The PTO max balance cap depends on the selected tenure tier.
    const maxPto = useMemo(() => {
        const tier = ACCRUAL_TIERS.find(t => t.id === selectedTier);
        return tier?.maxPto ?? 210;
    }, [selectedTier]);

    const projections = useMemo(() => {
        const pto = parseFloat(currentPto);
        const sick = parseFloat(currentSick);
        const ptoRate = parseFloat(ptoRatePerHour);
        const sickRate = parseFloat(sickRatePerHour);

        const results = new Map();
        if (isNaN(pto) || isNaN(sick) || isNaN(ptoRate) || isNaN(sickRate)) {
            return results;
        }
        
        const MAX_PTO = maxPto;
        const MAX_SICK = 80;

        let runningPto = pto;
        let runningSick = sick;
        let lastDate = new Date(today);

        for (const dateStr of sortedSelectedDates) {
            const futureDate = parseDateStr(dateStr);
            if (!futureDate) continue; 

            const workdays = calculateWorkdays(lastDate, futureDate, holidaySet);
            const hoursWorked = workdays * 8;

            runningPto += hoursWorked * ptoRate;
            runningSick += hoursWorked * sickRate;
            
            if (runningPto > MAX_PTO) {
                runningPto = MAX_PTO;
            }
            if (runningSick > MAX_SICK) {
                runningSick = MAX_SICK;
            }
            
            const vacationHoursToDeduct = 8;

            // Sick time is drained first, then PTO covers any remaining hours.
            if (runningSick - vacationHoursToDeduct >= -16) {
                runningSick -= vacationHoursToDeduct;
            } else {
                const sickAvailable = runningSick + 16;
                
                if (sickAvailable > 0) {
                    runningSick -= sickAvailable;
                }
                
                const ptoHoursNeeded = vacationHoursToDeduct - sickAvailable;
                runningPto -= ptoHoursNeeded;
            }

            results.set(dateStr, { pto: runningPto, sick: runningSick });
            
            lastDate = new Date(futureDate);
            lastDate.setDate(lastDate.getDate() + 1);
        }

        return results;
    }, [currentPto, currentSick, ptoRatePerHour, sickRatePerHour, sortedSelectedDates, today, holidaySet, maxPto]);


    // --- Render ---
    return (
        <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
            <div className="container mx-auto p-4 md:p-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-800">PTO Projector</h1>
                    <p className="text-gray-600 mt-2">Enter your current balances and select future vacation days to see your projected PTO.</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Inputs Column */}
                    <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow-lg">
                        <h2 className="text-2xl font-semibold mb-6 border-b pb-3">Time Off Balance</h2>
                        <div className="space-y-6">
                            <div>
                                <label htmlFor="tenure-select" className="block text-sm font-medium text-gray-700 mb-1">Years at PunchThrough</label>
                                <select id="tenure-select" value={selectedTier} onChange={handleAccrualTierChange} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white">
                                    {ACCRUAL_TIERS.map(tier => (
                                        <option key={tier.id} value={tier.id}>{tier.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="current-pto" className="block text-sm font-medium text-gray-700 mb-1">Current PTO Balance (hours)</label>
                                <input type="text" inputMode="decimal" id="current-pto" value={currentPto} onChange={e => setCurrentPto(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/>
                            </div>
                            <div>
                                <label htmlFor="current-sick" className="block text-sm font-medium text-gray-700 mb-1">Current Sick Balance (hours)</label>
                                <input type="text" inputMode="decimal" id="current-sick" value={currentSick} onChange={e => setCurrentSick(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/>
                            </div>
                            <div className="text-xs text-gray-500 pt-2 border-t">
                                <p className="font-bold">Rules:</p>
                                <p>• Assumes an 8-hour workday, Mon-Fri.</p>
                                <p>• PTO Accrual: {ptoRatePerHour} hrs per hour worked.</p>
                                <p>• Sick Accrual: {sickRatePerHour} hrs per hour worked.</p>
                                <p>• Max PTO balance: {maxPto} hours.</p>
                                <p>• Max Sick balance: 80 hours.</p>
                                <p>• PTO can go down to -40 hours.</p>
                                <p>• Sick time can go down to -16 hours.</p>
                                <p>• Vacation uses Sick time first, then PTO.</p>
                                <p className="font-bold mt-2">Holidays:</p>
                                <div className="leading-relaxed">
                                    {holidayList.map(h => (
                                        <p key={h.name}>{h.name}: {h.label}</p>
                                    ))}
                                </div>

                            </div>
                        </div>
                    </div>

                    {/* Calendar & Projections Column */}
                    <div className="lg:col-span-2 space-y-8">
                        <Calendar 
                            selectedDates={selectedDates} 
                            onDateSelect={handleDateSelect}
                            month={month}
                            year={year}
                            setMonth={setMonth}
                            setYear={setYear}
                            holidays={holidaySet}
                        />
                        
                        <div className="bg-white p-6 rounded-lg shadow-lg">
                             <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-semibold">Projected Balances</h2>
                                {sortedSelectedDates.length > 0 && 
                                    <button onClick={handleClearSelection} className="text-sm text-blue-600 hover:text-blue-800">Clear Selection</button>
                                }
                            </div>
                            {sortedSelectedDates.length > 0 ? (
                                <ul className="space-y-3">
                                    {sortedSelectedDates.map(dateStr => {
                                        const projection = projections.get(dateStr);
                                        const displayDate = parseDateStr(dateStr);

                                        if (!projection || !displayDate) {
                                            return null;
                                        }
                                        
                                        const { pto: ptoBalance, sick: sickBalance } = projection;
                                        const ptoColor = ptoBalance < -40 ? 'text-red-500 font-bold' : ptoBalance < 0 ? 'text-yellow-600' : 'text-green-600';
                                        const sickColor = sickBalance < -16 ? 'text-red-500 font-bold' : sickBalance < 0 ? 'text-yellow-600' : 'text-green-600';

                                        return (
                                            <li key={dateStr} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                                                <span className="font-medium">{displayDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                                <div className="text-right">
                                                    <span className={`block text-sm ${ptoColor}`}>PTO: {ptoBalance.toFixed(2)} hrs</span>
                                                    <span className={`block text-sm ${sickColor}`}>Sick: {sickBalance.toFixed(2)} hrs</span>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="text-gray-500 text-center py-8">Select one or more workdays on the calendar to see your projected balances.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
