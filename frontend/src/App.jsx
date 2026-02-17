import React, { useState, useEffect } from 'react';
import Widget from './components/Widget';
import './Dashboard.css';

function App() {
    const [data, setData] = useState(null);
    const [hsDaily, setHsDaily] = useState({ time: '--:--', activity: '--%' });
    const [hsWeekly, setHsWeekly] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    const fetchDashboard = async () => {
        try {
            let apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            if (!apiUrl.startsWith('http')) apiUrl = `https://${apiUrl}`;
            const dashboardRes = await fetch(`${apiUrl}/api/dashboard`);
            const dashboardJson = await dashboardRes.json();
            setData(dashboardJson);
            if (loading) setLoading(false);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        }
    };

    const fetchHubstaffToday = async () => {
        try {
            let apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            if (!apiUrl.startsWith('http')) apiUrl = `https://${apiUrl}`;
            const res = await fetch(`${apiUrl}/api/hubstaff/today`);
            const json = await res.json();
            if (!json.error) setHsDaily(json);
        } catch (error) {
            console.error('Error fetching Hubstaff Today:', error);
        }
    };

    const fetchHubstaffWeekly = async () => {
        try {
            let apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            if (!apiUrl.startsWith('http')) apiUrl = `https://${apiUrl}`;
            const res = await fetch(`${apiUrl}/api/hubstaff/weekly`);
            const json = await res.json();
            if (Array.isArray(json)) setHsWeekly(json);
        } catch (error) {
            console.error('Error fetching Hubstaff Weekly:', error);
        }
    };

    useEffect(() => {
        // Initial fetch
        fetchDashboard();
        fetchHubstaffToday();
        fetchHubstaffWeekly();
        setLoading(false);

        const dashboardInterval = setInterval(fetchDashboard, 60000); // 1 min
        const hsTodayInterval = setInterval(fetchHubstaffToday, 15 * 60 * 1000); // 15 mins
        const hsWeeklyInterval = setInterval(fetchHubstaffWeekly, 4 * 60 * 60 * 1000); // 4 hours
        const clockInterval = setInterval(() => setCurrentTime(new Date()), 60 * 1000); // 1 min

        return () => {
            clearInterval(dashboardInterval);
            clearInterval(hsTodayInterval);
            clearInterval(hsWeeklyInterval);
            clearInterval(clockInterval);
        };
    }, []);

    // Default values
    const slack = data?.slack || { mentions: 0, unread_messages: 0, latest_message: '...' };
    const calendar = data?.calendar || { next_meeting: '--:--', title: 'No meetings', platform: '' };
    const build = data?.build || { status: 'Unknown', project: '' };
    const weather = data?.weather || { temp: '--', location: '---' };

    // Hubstaff defaults
    // Hubstaff defaults (Removed - now in state)

    return (
        <div className="dashboard-grid">
            {/* Row 1: Hubstaff Today & Slack & Calendar (Adjusted layout) */}

            {/* Split Widgets: Status & Hubstaff Daily */}
            <Widget
                title="Status"
                value={
                    <div className="hs-today-container">
                        <div className="hs-item">
                            <span className="hs-val">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="hs-label">{weather.temp}°C {weather.location}</span>
                        </div>
                    </div>
                }
                type="status"
                loading={false}
            />

            <Widget
                title="Hubstaff Today"
                value={
                    <div className="hs-today-container">
                        <div className="hs-item">
                            <span className="hs-val">{hsDaily.time}</span>
                            <span className="hs-label">Worked</span>
                        </div>
                        <div className="hs-divider-vert"></div>
                        <div className="hs-item">
                            <span className="hs-val">{hsDaily.activity}</span>
                            <span className="hs-label">Activity</span>
                        </div>
                    </div>
                }
                type="hubstaff-daily"
                loading={loading}
            />



            <Widget
                title="Last 7 Days"
                value={hsWeekly}
                type="hubstaff-weekly"
                loading={loading}
            />

            <Widget
                title="Next Meeting"
                value={calendar.next_meeting}
                meta={`${calendar.title} (${calendar.platform})`}
                type="calendar"
                loading={loading && !data}
            />

            <Widget
                title="Slack Mentions"
                value={slack.mentions}
                meta={`${slack.unread_messages} unread messages`}
                type="slack"
                loading={loading && !data}
            />

            {/* Build widget logic can be added/kept if needed, or removed if not fitting the grid
                The CSS grid supports 5 items if we adjust.
                For now I'll keep it as the user didn't ask to remove it,
                but I need to accept that the layout might shift.
            */}
            <Widget
                title="Build Status"
                value={build.status}
                meta={build.project}
                type="build"
                loading={loading && !data}
            />
        </div>
    );
}

export default App;
