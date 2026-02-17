import React from 'react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import '../Dashboard.css';

const HubstaffWeek = ({ data, loading }) => {
    if (loading) {
        return (
            <div className="widget widget-hubstaff-week loading">
                ...
            </div>
        );
    }

    // Transform data for chart
    // We want Date vs Activity % (as number)
    // data is [{date: 'YYYY-MM-DD', time: 'HH:MM', activity: '32%'}, ...]
    const chartData = data.map(d => ({
        name: d.date,
        // activity string "32%" -> number 32
        activity: parseInt(d.activity.replace('%', '')) || 0
    })).reverse(); // Chart should likely be chronological (oldest -> newest)

    // Table data should probably remain newest -> oldest (as passed)

    return (
        <div className="widget widget-hubstaff-week">
            {/* Background Chart */}
            <div className="hw-chart-background">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ffffff" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="activity"
                            stroke="#ffffff"
                            fillOpacity={1}
                            fill="url(#colorActivity)"
                            strokeWidth={2}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Foreground Table */}
            <div className="hw-table-container">
                <table className="hw-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Act</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((day, index) => (
                            <tr key={index}>
                                {/* Date format: DD-MM */}
                                <td>{day.date.slice(5).split('-').reverse().join('-')}</td>
                                <td>{day.time}</td>
                                <td>{day.activity}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default HubstaffWeek;
