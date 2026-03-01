const getApiUrl = () => {
    let apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    if (!apiUrl.startsWith('http')) apiUrl = `https://${apiUrl}`;
    return apiUrl;
};

export const fetchDashboardData = async () => {
    const res = await fetch(`${getApiUrl()}/api/dashboard`);
    if (!res.ok) throw new Error('Failed to fetch dashboard data');
    return res.json();
};

export const fetchHubstaffTodayData = async () => {
    const res = await fetch(`${getApiUrl()}/api/hubstaff/today`);
    if (!res.ok) throw new Error('Failed to fetch Hubstaff today data');
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
};

export const fetchHubstaffWeeklyData = async () => {
    const res = await fetch(`${getApiUrl()}/api/hubstaff/weekly`);
    if (!res.ok) throw new Error('Failed to fetch Hubstaff weekly data');
    return res.json();
};
