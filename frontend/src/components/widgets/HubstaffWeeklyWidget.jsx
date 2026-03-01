import React from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const HubstaffWeeklyWidget = ({ data, loading }) => {
    if (loading) {
        return (
            <div className="widget widget-hubstaff-weekly">
                <div className="widget-title">Last 7 Days</div>
                <div className="widget-value loading">...</div>
            </div>
        );
    }

    if (!data || !Array.isArray(data)) return null;

    const chartData = [...data].reverse().map(day => {
        const [hours, minutes] = day.time.split(':').map(Number);
        return {
            ...day,
            hours: hours + minutes / 60,
            actVal: parseInt(day.activity)
        };
    });

    return (
        <div className="widget widget-hubstaff-weekly">
            <div className="hw-chart-background">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ffffff" stopOpacity={0.5} />
                                <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="hours"
                            stroke="#ffffff"
                            fillOpacity={1}
                            fill="url(#colorTime)"
                            strokeWidth={2}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <div className="widget-title">Last 7 Days</div>
            <div className="widget-table-container">
                <table className="widget-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Act.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((day, index) => (
                            <tr key={index}>
                                <td>{day.date.split('-').reverse().slice(0, 2).join('-')}</td>
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

export default HubstaffWeeklyWidget;
