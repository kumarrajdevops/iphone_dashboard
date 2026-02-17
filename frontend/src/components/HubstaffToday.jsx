import React, { useState, useEffect } from 'react';
import '../Dashboard.css';

const HubstaffToday = ({ time: hsTime, activity, loading }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [weather, setWeather] = useState({ temp: '--', condition: '...' });

    useEffect(() => {
        // Clock timer
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        // Fetch Weather (Hyderabad)
        const fetchWeather = async () => {
            try {
                // Open-Meteo API for Hyderabad (17.3850, 78.4867)
                const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=17.3850&longitude=78.4867&current=temperature_2m,weather_code');
                const data = await res.json();
                if (data.current) {
                    setWeather({
                        temp: `${Math.round(data.current.temperature_2m)}°C`,
                        condition: 'Hyd' // User requested "Hyd"
                    });
                }
            } catch (e) {
                console.error("Weather fetch failed", e);
            }
        };

        fetchWeather();
        // Refresh weather every 30 mins
        const weatherTimer = setInterval(fetchWeather, 30 * 60 * 1000);

        return () => {
            clearInterval(timer);
            clearInterval(weatherTimer);
        };
    }, []);

    const formatTime = (date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    if (loading) {
        return (
            <div className="widget widget-hubstaff-today loading">
                ...
            </div>
        );
    }

    return (
        <div className="widget widget-hubstaff-today">
            {/* Top Row: Time | Weather */}
            <div className="hs-today-header">
                <div className="hs-header-item">
                    <span className="hs-label">Current time</span>
                    <span className="hs-value-large">{formatTime(currentTime)}</span>
                </div>
                <div className="hs-separator"></div>
                <div className="hs-header-item">
                    <span className="hs-label">Weather</span>
                    <span className="hs-value-large">{weather.temp} <span style={{ fontSize: '0.6em' }}>{weather.condition}</span></span>
                </div>
            </div>

            <div className="hs-divider"></div>

            <div className="hs-title-section">
                hubstaff today
            </div>

            {/* Bottom Row: Worked Time | Avg Activity */}
            <div className="hs-today-stats">
                <div className="hs-stat-item">
                    <span className="hs-label">Worked time</span>
                    <div className="hs-stat-value">{hsTime}</div>
                </div>
                <div className="hs-separator"></div>
                <div className="hs-stat-item">
                    <span className="hs-label">Avg Activity</span>
                    <div className="hs-stat-value">{activity}</div>
                </div>
            </div>
        </div>
    );
};

export default HubstaffToday;
