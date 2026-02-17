import React from 'react';
import { AreaChart, Area, ResponsiveContainer, XAxis } from 'recharts';
import '../Dashboard.css';

const Widget = ({ title, value, meta, type, loading }) => {
    if (loading) {
        return (
            <div className={`widget widget-${type}`}>
                <div className="widget-title">{title}</div>
                <div className="widget-value loading">...</div>
            </div>
        );
    }

    if (type === 'hubstaff-weekly' && Array.isArray(value)) {
        // Process data for chart: Reverse (oldest first) and parse time
        const chartData = [...value].reverse().map(day => {
            const [hours, minutes] = day.time.split(':').map(Number);
            return {
                ...day,
                hours: hours + minutes / 60,
                actVal: parseInt(day.activity)
            };
        });

        return (
            <div className={`widget widget-${type}`}>
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
                <div className="widget-title">{title}</div>
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
                            {value.map((day, index) => (
                                <tr key={index}>
                                    <td>{day.date.split('-').reverse().slice(0, 2).join('-')}</td> {/* DD-MM */}
                                    <td>{day.time}</td>
                                    <td>{day.activity}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className={`widget widget-${type}`}>
            <div className="widget-title">{title}</div>
            <div className="widget-value">{value}</div>
            {meta && <div className="widget-meta">{meta}</div>}
        </div>
    );
};

export default Widget;
