import React from 'react';

const GoldWidget = ({ data, loading }) => {
    if (loading) {
        return (
            <div className="widget widget-gold">
                <div className="widget-title">Today's Gold Rates</div>
                <div className="widget-value loading">...</div>
            </div>
        );
    }

    return (
        <div className="widget widget-gold">
            <div className="widget-title">Today's Gold Rates</div>
            <div className="gold-rates-list" style={{ width: '100%', overflowY: 'auto', flexGrow: 1, marginTop: '10px' }}>
                {data.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '0.9rem' }}>
                        <span style={{ opacity: 0.9 }}>{item.label}</span>
                        <span style={{ fontWeight: 600 }}>₹ {item.price}</span>
                    </div>
                ))}
                {data.length === 0 && <div style={{ opacity: 0.5, marginTop: '10px' }}>Fetching rates...</div>}
            </div>
        </div>
    );
};

export default GoldWidget;
