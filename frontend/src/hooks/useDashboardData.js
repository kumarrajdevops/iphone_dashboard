import { useState, useEffect } from 'react';
import { fetchDashboardData, fetchHubstaffTodayData, fetchHubstaffWeeklyData } from '../services/api';

export const useDashboardData = () => {
    const [data, setData] = useState(null);
    const [hsDaily, setHsDaily] = useState({ time: '--:--', activity: '--%' });
    const [hsWeekly, setHsWeekly] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                const [dashboardRes, hsTodayRes, hsWeeklyRes] = await Promise.allSettled([
                    fetchDashboardData(),
                    fetchHubstaffTodayData(),
                    fetchHubstaffWeeklyData()
                ]);

                if (isMounted) {
                    if (dashboardRes.status === 'fulfilled') setData(dashboardRes.value);
                    if (hsTodayRes.status === 'fulfilled') setHsDaily(hsTodayRes.value);
                    if (hsWeeklyRes.status === 'fulfilled' && Array.isArray(hsWeeklyRes.value)) setHsWeekly(hsWeeklyRes.value);
                    setLoading(false);
                }
            } catch (error) {
                console.error("Error loading dashboard data:", error);
                if (isMounted) setLoading(false);
            }
        };

        const fetchDashboard = async () => {
            try {
                const json = await fetchDashboardData();
                if (isMounted) setData(json);
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            }
        };

        const fetchHubstaffToday = async () => {
            try {
                const json = await fetchHubstaffTodayData();
                if (isMounted) setHsDaily(json);
            } catch (error) {
                console.error('Error fetching Hubstaff Today:', error);
            }
        };

        const fetchHubstaffWeekly = async () => {
            try {
                const json = await fetchHubstaffWeeklyData();
                if (isMounted && Array.isArray(json)) setHsWeekly(json);
            } catch (error) {
                console.error('Error fetching Hubstaff Weekly:', error);
            }
        };

        loadData();

        const dashboardInterval = setInterval(fetchDashboard, 60000); // 1 min
        const hsTodayInterval = setInterval(fetchHubstaffToday, 15 * 60 * 1000); // 15 mins
        const hsWeeklyInterval = setInterval(fetchHubstaffWeekly, 4 * 60 * 60 * 1000); // 4 hours
        const clockInterval = setInterval(() => setCurrentTime(new Date()), 60 * 1000); // 1 min

        return () => {
            isMounted = false;
            clearInterval(dashboardInterval);
            clearInterval(hsTodayInterval);
            clearInterval(hsWeeklyInterval);
            clearInterval(clockInterval);
        };
    }, []);

    return { data, hsDaily, hsWeekly, loading, currentTime };
};
