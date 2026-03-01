import React from 'react';
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

    return (
        <div className={`widget widget-${type}`}>
            <div className="widget-title">{title}</div>
            <div className="widget-value">{value}</div>
            {meta && <div className="widget-meta">{meta}</div>}
        </div>
    );
};

export default Widget;
