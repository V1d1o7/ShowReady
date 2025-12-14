// frontend/src/utils/hoursCalculations.js

export const calculateWeeklyTotals = (crewHours, otDailyThreshold, otWeeklyThreshold) => {
    if (!crewHours || crewHours.length === 0) {
        return [];
    }

    const newCrewHours = JSON.parse(JSON.stringify(crewHours));

    // 1. Group by Roster ID
    const groupedCrew = {};
    newCrewHours.forEach(c => {
        const rosterId = c.roster_id || `temp_${c.show_crew_id}`;
        if (!groupedCrew[rosterId]) {
            groupedCrew[rosterId] = [];
        }
        groupedCrew[rosterId].push(c);
    });

    // 2. Calculate daily stats for each person (group)
    Object.values(groupedCrew).forEach(members => {
        members.sort((a, b) => (a.rate_type !== 'daily') - (b.rate_type !== 'daily'));

        let weeklyRegularHoursTracker = 0;

        members.forEach(m => {
            m.calculatedStats = { regular: 0, ot: 0, cost: 0 };
        });

        // Get all unique dates for the week
        const allDates = new Set();
        members.forEach(m => {
            Object.keys(m.hours_by_date || {}).forEach(d => allDates.add(d));
        });

        allDates.forEach(date => {
            const dayEntries = [];
            members.forEach(m => {
                const hours = parseFloat(m.hours_by_date?.[date] || 0);
                if (hours > 0) {
                    dayEntries.push({ member: m, hours });
                }
            });

            if (dayEntries.length === 0) return;

            let hoursConsumedInDailyBucket = 0;
            const hasDayRateOnDay = dayEntries.some(e => e.member.rate_type === 'daily');

            dayEntries.forEach(entry => {
                const { member, hours } = entry;
                let regular_h = 0;
                let ot_h = 0;
                let entry_cost = 0;

                if (member.rate_type === 'daily') {
                    entry_cost += parseFloat(member.daily_rate || 0);
                    if (hours <= otDailyThreshold) {
                        regular_h = hours;
                    } else {
                        regular_h = otDailyThreshold;
                        ot_h = hours - otDailyThreshold;
                        const impliedRate = (parseFloat(member.daily_rate || 0)) / (otDailyThreshold > 0 ? otDailyThreshold : 10);
                        entry_cost += ot_h * (impliedRate * 1.5);
                    }
                    hoursConsumedInDailyBucket += otDailyThreshold;
                } else { // Hourly
                    const currentRate = parseFloat(member.hourly_rate || 0);
                    const remainingBucket = Math.max(0, otDailyThreshold - hoursConsumedInDailyBucket);

                    if (hasDayRateOnDay) {
                        const absorbedHours = Math.min(hours, remainingBucket);
                        const overflowHours = hours - absorbedHours;
                        regular_h = absorbedHours;
                        ot_h = overflowHours;
                        entry_cost += overflowHours * (currentRate * 1.5);
                        hoursConsumedInDailyBucket += absorbedHours;
                    } else {
                        const straightPortion = Math.min(hours, remainingBucket);
                        const otPortion = hours - straightPortion;
                        entry_cost += straightPortion * currentRate;
                        entry_cost += otPortion * (currentRate * 1.5);
                        regular_h = straightPortion;
                        ot_h = otPortion;
                        hoursConsumedInDailyBucket += straightPortion;
                    }
                }
                member.calculatedStats.regular += regular_h;
                member.calculatedStats.ot += ot_h;
                member.calculatedStats.cost += entry_cost;
                if (member.rate_type === 'hourly') {
                    weeklyRegularHoursTracker += regular_h;
                }
            });
        });

        // 3. Weekly OT Calculation for the group
        if (weeklyRegularHoursTracker > otWeeklyThreshold) {
            let weeklyOtHours = weeklyRegularHoursTracker - otWeeklyThreshold;
            
            // Distribute OT back to hourly positions (in reverse order)
            [...members].reverse().forEach(member => {
                if (member.rate_type === 'hourly' && weeklyOtHours > 0) {
                    const currentRate = parseFloat(member.hourly_rate || 0);
                    const regularHoursInMember = member.calculatedStats.regular;
                    const otToApply = Math.min(weeklyOtHours, regularHoursInMember);

                    member.calculatedStats.regular -= otToApply;
                    member.calculatedStats.ot += otToApply;
                    member.calculatedStats.cost -= otToApply * currentRate;
                    member.calculatedStats.cost += otToApply * (currentRate * 1.5);

                    weeklyOtHours -= otToApply;
                }
            });
        }
    });

    return newCrewHours;
};