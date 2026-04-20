import React, { useEffect, useMemo, useState } from 'react';
import { fetchTasksFile, updateTasksFile } from '../../services/api';

const starterTemplate = `# TODO -----20/04/2026

| Done | Task | Status | Remark |
| --- | --- | --- | --- |
| [ ] | First office task (office) | in-progress | morning plan |
| [x] | Learning task (learning) | completed | completed and documented |
| [ ] | Personal follow-up (personal) | in-progress | to do by EOD |
`;

const countCheckboxes = (markdown) => {
  const total = (markdown.match(/\[[xX ]\]/g) || []).length;
  const done = (markdown.match(/\[[xX]\]/g) || []).length;
  return { total, done, inProgress: Math.max(0, total - done) };
};

const footnotesTemplate = `Footnotes
- Leave reason: Paternity leave, Sick leave, etc.
- Status: completed, in-progress, postponed, blocked, leave, weekoff`;

const TODO_HEADER_REGEX = /^\s*#?\s*TODO\b.*$/i;
const TODO_DATE_REGEX = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;

const parseTodoDate = (headerLine) => {
  const match = headerLine.match(TODO_DATE_REGEX);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const isTodoHeader = (line) => TODO_HEADER_REGEX.test(line) && TODO_DATE_REGEX.test(line);

const dateKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
const todayKey = () => dateKey(new Date());
const toDayTime = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const sectionHasWorkingTask = (content) => {
  const normalized = content.toLowerCase();
  const hasTaskRow = normalized.includes('|');
  const hasWorkStatus = normalized.includes('| in-progress |')
    || normalized.includes('| completed |')
    || normalized.includes('| postponed |')
    || normalized.includes('| blocked |');
  return hasTaskRow && hasWorkStatus;
};

const splitTodoSections = (markdown) => {
  const lines = markdown.split('\n');
  const sections = [];
  let current = null;

  const flushCurrent = () => {
    if (!current) return;
    current.content = current.lines.join('\n').trimEnd();
    sections.push(current);
    current = null;
  };

  lines.forEach((line) => {
    if (isTodoHeader(line)) {
      flushCurrent();
      const parsedDate = parseTodoDate(line);
      current = {
        header: line,
        parsedDate,
        key: parsedDate ? dateKey(parsedDate) : null,
        lines: [line],
      };
    } else if (current) {
      current.lines.push(line);
    }
  });

  flushCurrent();
  return sections;
};

const buildTodaySectionTemplate = () => {
  const today = new Date().toLocaleDateString('en-GB');
  return `# TODO -----${today}

| Done | Task | Status | Remark |
| --- | --- | --- | --- |
| [ ] | New task (office) | in-progress | |`;
};

const buildFocusedEditorView = (fullMarkdown) => {
  const sections = splitTodoSections(fullMarkdown);
  if (!sections.length) {
    return {
      editorContent: `${starterTemplate}\n\n${buildTodaySectionTemplate()}`,
      editableKeys: [],
    };
  }

  const today = new Date();
  const tKey = todayKey();
  const todayTime = toDayTime(today);
  let latestPreviousWithTasks = null;
  let latestPreviousAny = null;
  let todaySection = null;

  sections.forEach((sec) => {
    if (!sec.parsedDate) return;
    const secTime = toDayTime(sec.parsedDate);
    if (sec.key === tKey) todaySection = sec;
    if (secTime < todayTime && (!latestPreviousAny || secTime > toDayTime(latestPreviousAny.parsedDate))) {
      latestPreviousAny = sec;
    }
    if (
      secTime < todayTime
      && sectionHasWorkingTask(sec.content)
      && (!latestPreviousWithTasks || secTime > toDayTime(latestPreviousWithTasks.parsedDate))
    ) {
      latestPreviousWithTasks = sec;
    }
  });

  const anchorSection = latestPreviousWithTasks || latestPreviousAny;
  const chunks = [];
  const keys = new Set();

  if (anchorSection?.parsedDate) {
    const anchorTime = toDayTime(anchorSection.parsedDate);
    sections.forEach((sec) => {
      if (!sec.parsedDate) return;
      const secTime = toDayTime(sec.parsedDate);
      if (secTime >= anchorTime && secTime <= todayTime) {
        chunks.push(sec.content);
        if (sec.key) keys.add(sec.key);
      }
    });
  }

  if (!todaySection) {
    chunks.push(buildTodaySectionTemplate());
    keys.add(tKey);
  }

  return { editorContent: chunks.join('\n\n'), editableKeys: Array.from(keys) };
};

const mergeFocusedEditsIntoFullContent = (fullContent, editorContent, editableKeys) => {
  // Safety guard: never overwrite full history when no editable range resolved.
  if (!editableKeys.length) return fullContent || editorContent;

  const fullSections = splitTodoSections(fullContent);
  const editedSections = splitTodoSections(editorContent);

  const editedByKey = new Map();
  const editedSectionByKey = new Map();
  editedSections.forEach((sec) => {
    if (sec.key) {
      editedByKey.set(sec.key, sec.content);
      editedSectionByKey.set(sec.key, sec);
    }
  });
  const fullKeySet = new Set(fullSections.map((sec) => sec.key).filter(Boolean));

  const editableSet = new Set(editableKeys);
  const usedEditedKeys = new Set();
  const ordered = [];

  fullSections.forEach((sec) => {
    if (sec.key && editableSet.has(sec.key)) {
      const updated = editedByKey.get(sec.key);
      if (updated) {
        const editedSec = editedSectionByKey.get(sec.key);
        ordered.push({ content: updated, parsedDate: editedSec?.parsedDate || sec.parsedDate, key: sec.key });
        usedEditedKeys.add(sec.key);
      }
      return;
    }
    ordered.push({ content: sec.content, parsedDate: sec.parsedDate, key: sec.key });
  });

  // Add newly created editable sections (for example, first-time today's block).
  editedSections.forEach((sec) => {
    if (!sec.key || !editableSet.has(sec.key) || usedEditedKeys.has(sec.key)) return;
    ordered.push({ content: sec.content, parsedDate: sec.parsedDate, key: sec.key });
    usedEditedKeys.add(sec.key);
  });

  // Preserve manually added date sections that were not in the previous editable range.
  editedSections.forEach((sec) => {
    if (!sec.key) return;
    if (fullKeySet.has(sec.key) || usedEditedKeys.has(sec.key)) return;
    ordered.push({ content: sec.content, parsedDate: sec.parsedDate, key: sec.key });
    usedEditedKeys.add(sec.key);
  });

  // Keep date sections in chronological order for stable history.
  ordered.sort((a, b) => {
    if (a.parsedDate && b.parsedDate) return toDayTime(a.parsedDate) - toDayTime(b.parsedDate);
    if (a.parsedDate) return -1;
    if (b.parsedDate) return 1;
    return 0;
  });

  return ordered
    .map((sec) => sec.content || '')
    .filter(Boolean)
    .join('\n\n')
    .trim() + '\n';
};

const TasksEditor = () => {
  const [content, setContent] = useState('');
  const [fullContent, setFullContent] = useState('');
  const [editableKeys, setEditableKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pathInfo, setPathInfo] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchTasksFile();
        const source = data.content || starterTemplate;
        setFullContent(source);
        const focused = buildFocusedEditorView(source);
        setContent(focused.editorContent);
        setEditableKeys(focused.editableKeys);
        setPathInfo(`${data.path} @ ${data.branch}`);
      } catch (err) {
        setFullContent(starterTemplate);
        const focused = buildFocusedEditorView(starterTemplate);
        setContent(focused.editorContent);
        setEditableKeys(focused.editableKeys);
        setPathInfo('Preview mode (GitHub sync env vars not configured)');
        setError(err.message || 'Failed to load tasks file.');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const metrics = useMemo(() => countCheckboxes(content), [content]);

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setStatus('');
    try {
      const finalContent = mergeFocusedEditsIntoFullContent(fullContent, content, editableKeys);
      const result = await updateTasksFile({
        content: finalContent,
        message: `chore(tasks): update daily tasks ${new Date().toISOString().slice(0, 10)}`,
      });
      setFullContent(finalContent);
      if (result.mode === 'local') {
        setStatus('Saved locally. Static page is updated in local markdown source.');
      } else {
        setStatus(`Saved and pushed. Commit: ${result.commit_sha?.slice(0, 7) || 'created'}`);
      }
    } catch (err) {
      setError(err.message || 'Failed to save tasks file.');
    } finally {
      setIsSaving(false);
    }
  };

  const insertTodayBlock = () => {
    const today = new Date().toLocaleDateString('en-GB');
    const block = `\n\n# TODO -----${today}\n\n| Done | Task | Status | Remark |\n| --- | --- | --- | --- |\n| [ ] | New task (office) | in-progress | |\n`;
    setContent((prev) => `${prev.trimEnd()}${block}`);
  };

  const addTableRow = () => {
    setContent((prev) => `${prev}${prev.endsWith('\n') ? '' : '\n'}| [ ] | New task | in-progress | |\n`);
  };

  const insertLeaveDay = () => {
    const today = new Date().toLocaleDateString('en-GB');
    const block = `\n\n# TODO -----${today}\n**Day Note:** Leave\n\n| Done | Task | Status | Remark |\n| --- | --- | --- | --- |\n| [ ] | Leave | leave | Sick leave |\n`;
    setContent((prev) => `${prev.trimEnd()}${block}`);
  };

  const insertWeekoffDay = () => {
    const today = new Date().toLocaleDateString('en-GB');
    const block = `\n\n# TODO -----${today}\n**Day Note:** Week Off\n\n| Done | Task | Status | Remark |\n| --- | --- | --- | --- |\n| [ ] | Week Off | weekoff | Weekend |\n`;
    setContent((prev) => `${prev.trimEnd()}${block}`);
  };

  const copyFootnotes = async () => {
    try {
      await navigator.clipboard.writeText(footnotesTemplate);
      setStatus('Footnotes copied. Paste into your daily notes if needed.');
    } catch {
      setError('Unable to copy footnotes. Please copy manually from the box below.');
    }
  };

  return (
    <section className="tasks-shell">
      <header className="tasks-topbar">
        <div className="tasks-title-wrap">
          <h2>Daily Tasks Editor</h2>
          <p>Shows last task date through today (includes leave/weekoff in between). Save preserves older history automatically.</p>
          {pathInfo && <span className="tasks-path">{pathInfo}</span>}
        </div>
        <div className="tasks-actions">
          <button type="button" className="tasks-btn ghost" onClick={insertTodayBlock} disabled={isLoading || isSaving}>
            + Today Block
          </button>
          <button type="button" className="tasks-btn ghost" onClick={insertLeaveDay} disabled={isLoading || isSaving}>
            + Leave Day
          </button>
          <button type="button" className="tasks-btn ghost" onClick={insertWeekoffDay} disabled={isLoading || isSaving}>
            + Weekoff Day
          </button>
          <button type="button" className="tasks-btn ghost" onClick={addTableRow} disabled={isLoading || isSaving}>
            + Table Row
          </button>
          <button type="button" className="tasks-btn" onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? 'Saving...' : 'Save & Publish'}
          </button>
        </div>
      </header>

      <div className="tasks-metrics">
        <div><strong>{metrics.total}</strong><span>Total</span></div>
        <div><strong>{metrics.done}</strong><span>Done</span></div>
        <div><strong>{metrics.inProgress}</strong><span>In-Progress</span></div>
      </div>

      {status && <p className="tasks-status ok">{status}</p>}
      {error && <p className="tasks-status err">{error}</p>}

      <div className="tasks-panel">
        <div className="tasks-panel-head">
          <span>Markdown Editor</span>
          <small>Tip: use rows like `| [ ] | Task | in-progress | reason |`</small>
        </div>
        {isLoading ? (
          <p className="tasks-loading">Loading tasks markdown...</p>
        ) : (
          <textarea
            className="tasks-editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />
        )}
      </div>

      <section className="tasks-footnotes">
        <div className="tasks-footnotes-head">
          <strong>Footnotes (Copy/Paste)</strong>
          <button type="button" className="tasks-btn ghost" onClick={copyFootnotes}>Copy</button>
        </div>
        <pre>{footnotesTemplate}</pre>
      </section>
    </section>
  );
};

export default TasksEditor;
