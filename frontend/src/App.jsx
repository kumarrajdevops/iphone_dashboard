import React, { useState } from 'react';
import Dashboard from './features/dashboard/Dashboard';
import TasksEditor from './features/tasks/TasksEditor';
import './Dashboard.css';
import './features/tasks/TasksEditor.css';

function App() {
    const [activeView, setActiveView] = useState('dashboard');

    return (
        <div className="app-root">
            <header className="app-header-nav">
                <button
                    type="button"
                    className={`app-nav-btn ${activeView === 'dashboard' ? 'active' : ''}`}
                    onClick={() => setActiveView('dashboard')}
                >
                    Dashboard
                </button>
                <button
                    type="button"
                    className={`app-nav-btn ${activeView === 'tasks' ? 'active' : ''}`}
                    onClick={() => setActiveView('tasks')}
                >
                    Daily Tasks
                </button>
            </header>
            {activeView === 'dashboard' ? <Dashboard /> : <TasksEditor />}
        </div>
    );
}

export default App;
