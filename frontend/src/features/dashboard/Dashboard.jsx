import React from 'react';
import Widget from '../../components/Widget';
import { useDashboardData } from '../../hooks/useDashboardData';
import GoldWidget from '../../components/widgets/GoldWidget';
import HubstaffWeeklyWidget from '../../components/widgets/HubstaffWeeklyWidget';

const Dashboard = () => {
    const { data, hsDaily, hsWeekly, loading, currentTime } = useDashboardData();

    // Default values
    const slack = data?.slack || { mentions: 0, unread_messages: 0, latest_message: '...' };
    const gold = data?.gold || [];
    const build = data?.build || { status: 'Unknown', project: '' };
    const weather = data?.weather || { temp: '--', location: '---' };

    return (
        <div className="dashboard-grid">
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

            <HubstaffWeeklyWidget data={hsWeekly} loading={loading} />

            <GoldWidget data={gold} loading={loading && !data} />

            <Widget
                title="Slack Mentions"
                value={slack.mentions}
                meta={`${slack.unread_messages} unread messages`}
                type="slack"
                loading={loading && !data}
            />

            <Widget
                title="Build Status"
                value={build.status}
                meta={build.project}
                type="build"
                loading={loading && !data}
            />
        </div>
    );
};

export default Dashboard;
