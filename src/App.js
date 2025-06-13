import React, { useState, useMemo } from 'react';

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


// --- Holiday Data ---
// Using a Set for efficient O(1) lookups. Note: These are for 2025.
const holidays2025 = new Set([
    '2025-01-01', // New Year's Day
    '2025-01-20', // Martin Luther King, Jr. Day
    '2025-05-26', // Memorial Day
    '2025-06-19', // Juneteenth
    '2025-07-04', // Independence Day
    '2025-09-01', // Labor Day
    '2025-11-27', // Thanksgiving
    '2025-11-28', // Native American Heritage Day
    '2025-12-24', // Christmas Eve
    '2025-12-25', // Christmas Day
]);

const formattedHolidays = Array.from(holidays2025).map(dateStr => {
    const date = parseDateStr(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}).join(', ');


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
    // --- State Management ---
    const [currentPto, setCurrentPto] = useState("80");
    const [currentSick, setCurrentSick] = useState("40");
    const [ptoRatePerHour, setPtoRatePerHour] = useState((140 / 2081).toFixed(4)); 
    const [sickRatePerHour, setSickRatePerHour] = useState((1 / 30).toFixed(4));
    const [selectedDates, setSelectedDates] = useState(new Set());
    
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    // Calendar navigation state
    const [month, setMonth] = useState(today.getMonth());
    const [year, setYear] = useState(today.getFullYear());

    // --- Event Handlers ---
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
    
    const projections = useMemo(() => {
        const pto = parseFloat(currentPto);
        const sick = parseFloat(currentSick);
        const ptoRate = parseFloat(ptoRatePerHour);
        const sickRate = parseFloat(sickRatePerHour);

        const results = new Map();
        if (isNaN(pto) || isNaN(sick) || isNaN(ptoRate) || isNaN(sickRate)) {
            return results;
        }
        
        const MAX_PTO = 210;
        const MAX_SICK = 80;

        let runningPto = pto;
        let runningSick = sick;
        let lastDate = new Date(today);

        for (const dateStr of sortedSelectedDates) {
            const futureDate = parseDateStr(dateStr);
            if (!futureDate) continue; 

            const workdays = calculateWorkdays(lastDate, futureDate, holidays2025);
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
            
            if (runningPto - vacationHoursToDeduct >= -40) {
                runningPto -= vacationHoursToDeduct;
            } else {
                const ptoAvailable = runningPto + 40;
                
                if (ptoAvailable > 0) {
                    runningPto -= ptoAvailable;
                }
                
                const sickHoursNeeded = vacationHoursToDeduct - ptoAvailable;
                runningSick -= sickHoursNeeded;
            }

            results.set(dateStr, { pto: runningPto, sick: runningSick });
            
            lastDate = new Date(futureDate);
            lastDate.setDate(lastDate.getDate() + 1);
        }

        return results;
    }, [currentPto, currentSick, ptoRatePerHour, sickRatePerHour, sortedSelectedDates, today]);


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
                        <h2 className="text-2xl font-semibold mb-6 border-b pb-3">Current Balances & Accrual</h2>
                        <div className="space-y-6">
                            <div>
                                <label htmlFor="current-pto" className="block text-sm font-medium text-gray-700 mb-1">Current PTO (hours)</label>
                                <input type="text" inputMode="decimal" id="current-pto" value={currentPto} onChange={e => setCurrentPto(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/>
                            </div>
                            <div>
                                <label htmlFor="current-sick" className="block text-sm font-medium text-gray-700 mb-1">Current Sick Time (hours)</label>
                                <input type="text" inputMode="decimal" id="current-sick" value={currentSick} onChange={e => setCurrentSick(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/>
                            </div>
                            <div>
                                <label htmlFor="pto-accrual-rate" className="block text-sm font-medium text-gray-700 mb-1">PTO Accrual (per hour worked)</label>
                                <input type="text" inputMode="decimal" id="pto-accrual-rate" value={ptoRatePerHour} onChange={e => setPtoRatePerHour(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/>
                            </div>
                             <div>
                                <label htmlFor="sick-accrual-rate" className="block text-sm font-medium text-gray-700 mb-1">Sick Accrual (per hour worked)</label>
                                <input type="text" inputMode="decimal" id="sick-accrual-rate" value={sickRatePerHour} onChange={e => setSickRatePerHour(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/>
                            </div>
                            <div className="text-xs text-gray-500 pt-2 border-t">
                                <p className="font-bold">Rules:</p>
                                <p>• Assumes an 8-hour workday, Mon-Fri.</p>
                                <p>• Max PTO balance: 210 hours.</p>
                                <p>• Max Sick balance: 80 hours.</p>
                                <p>• PTO can go down to -40 hours.</p>
                                <p>• Sick time can go down to -16 hours.</p>
                                <p>• Vacation uses PTO first, then Sick time.</p>
                                <p className="font-bold mt-2">2025 Holidays:</p>
                                <p className="leading-relaxed">{formattedHolidays}</p>

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
                            holidays={holidays2025}
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
