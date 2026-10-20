import { useEffect, useMemo, useRef, useState } from 'react';
import { getDestinations, getHealth, getMetrics, importCatalogue, type ApiDestination, type ApiMetrics } from '@/lib/api';
import {
  Activity, ArrowUpRight, BarChart3, BookOpen, Check, ChevronDown, CircleHelp,
  ClipboardCheck, Cloud, Database, FileUp, Gauge, Globe2, Inbox, Layers3,
  LayoutDashboard, ListFilter, Menu, MoreHorizontal, Plus,
  Radio, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal,
  Terminal, UploadCloud, Users, X, Zap,
} from 'lucide-react';

type View = 'overview' | 'catalogue' | 'publishing' | 'rules' | 'certification' | 'connectors' | 'activity';
type Status = 'Live' | 'Ready' | 'Review' | 'Simulated';

type Destination = {
  name: string;
  platform: string;
  surface: string;
  audience: string;
  score: number;
  status: Status;
  last: string;
  color: string;
};

const destinations: Destination[] = [
  { name: 'Indie Hackers', platform: 'Discourse', surface: 'Forum', audience: 'Founders · SaaS', score: 5, status: 'Ready', last: 'Never', color: '#ef8f35' },
  { name: 'Lemmy.World', platform: 'Lemmy', surface: 'Community', audience: 'Open web · Tech', score: 4, status: 'Simulated', last: 'Today, 09:42', color: '#5ab39b' },
  { name: 'DEV Community', platform: 'Dev.to', surface: 'Developer blog', audience: 'Developers', score: 5, status: 'Ready', last: 'Yesterday', color: '#111827' },
  { name: 'The Growth Journal', platform: 'Ghost', surface: 'Publication', audience: 'Marketing · Growth', score: 4, status: 'Review', last: '—', color: '#d46a58' },
  { name: 'Founders Circle', platform: 'Assisted', surface: 'Partner network', audience: 'Founders', score: 3, status: 'Simulated', last: 'Jun 18, 14:20', color: '#71819b' },
];

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'catalogue', label: 'Destination catalogue', icon: Globe2 },
  { id: 'publishing', label: 'Publishing jobs', icon: Radio },
  { id: 'rules', label: 'Posting rules', icon: SlidersHorizontal },
  { id: 'certification', label: 'Certification', icon: ShieldCheck },
  { id: 'connectors', label: 'Connectors', icon: Layers3 },
  { id: 'activity', label: 'Activity log', icon: Activity },
];

function App() {
  const [view, setView] = useState<View>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [simulation, setSimulation] = useState(true);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [apiDestinations, setApiDestinations] = useState<Destination[]>([]);
  const [apiIssue, setApiIssue] = useState('');

  useEffect(() => {
    Promise.all([getMetrics(), getDestinations(), getHealth()]).then(([metricsResponse, destinationsResponse, healthResponse]) => {
      setMetrics(metricsResponse.data);
      setApiDestinations(destinationsResponse.data.map(toDestination));
      setSimulation(healthResponse.simulation);
      setApiIssue('');
    }).catch((error: unknown) => {
      setApiIssue(error instanceof Error ? error.message : 'The API is unavailable');
    });
  }, []);

  const visibleDestinations = apiDestinations.length ? apiDestinations : destinations;
  const filteredDestinations = useMemo(() => visibleDestinations.filter((destination) =>
    `${destination.name} ${destination.platform} ${destination.audience}`.toLowerCase().includes(query.toLowerCase())), [query, visibleDestinations]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const openView = (next: View) => {
    setView(next);
    setMobileNav(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><span>R</span></div>
          <div><strong>reachline</strong><small>distribution ops</small></div>
        </div>
        <div className="workspace-switcher"><div className="workspace-avatar">IC</div><div><span>IncuBrix workspace</span><small>Operations team</small></div><ChevronDown size={15} /></div>
        <div className="nav-label">Workspace</div>
        <nav className="main-nav">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => openView(id)}><Icon size={17} /><span>{label}</span>{id === 'publishing' && <b className="nav-count">3</b>}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="simulation-card"><div className="simulation-title"><span className="pulse-dot" />Simulation mode</div><p>Mock adapters are active. No live posts will be sent.</p><button onClick={() => setSimulation(!simulation)}>{simulation ? 'Enabled' : 'Disabled'}<span className={simulation ? 'toggle on' : 'toggle'}><span /></span></button></div>
        <button className="nav-item settings" onClick={() => notify('Workspace settings are ready for configuration')}><Settings2 size={17} /><span>Settings</span></button>
        <div className="user-row"><div className="user-avatar">JS</div><div><strong>Jordan Smith</strong><small>Admin</small></div><MoreHorizontal size={17} /></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{navItems.find((item) => item.id === view)?.label}</strong></div><div className="top-actions"><div className="system-state"><span className="status-dot" />All systems operational</div><button className="icon-button" onClick={() => notify('No new notifications')}><Inbox size={18} /><i /></button><div className="top-avatar">JS</div></div></header>
        <div className="page-wrap">
          {apiIssue && <div className="api-warning"><Database size={16} /><span><strong>Live API unavailable.</strong> {apiIssue} The current view is labelled preview data until the backend is reachable.</span></div>}
          {view === 'overview' && <Overview onNavigate={openView} onNotify={notify} simulation={simulation} metrics={metrics} rows={apiDestinations} />}
          {view === 'catalogue' && <Catalogue destinations={filteredDestinations} query={query} setQuery={setQuery} onImport={() => setShowImport(true)} onNotify={notify} />}
          {view === 'publishing' && <Publishing onNotify={notify} simulation={simulation} />}
          {view === 'rules' && <Rules onNotify={notify} />}
          {view === 'certification' && <Certification onNotify={notify} />}
          {view === 'connectors' && <Connectors onNotify={notify} />}
          {view === 'activity' && <ActivityView />}
        </div>
      </main>
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onNotify={notify} />}
    </div>
  );
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Overview({ onNavigate, onNotify, simulation, metrics, rows }: { onNavigate: (view: View) => void; onNotify: (message: string) => void; simulation: boolean; metrics: ApiMetrics | null; rows: Destination[] }) {
  return <>
    <PageIntro eyebrow="Monday, June 24, 2024" title="Good morning, Jordan" description="Here’s what’s happening across your distribution network." action={<button className="button primary" onClick={() => onNavigate('publishing')}><Plus size={16} />New publishing job</button>} />
    <div className="mode-banner"><div className="banner-icon"><Zap size={19} /></div><div><strong>Simulation mode is active</strong><span>All activity below uses mock adapters. Switch to live mode only after a destination is certified.</span></div><button onClick={() => onNavigate('certification')}>Review certification <ArrowUpRight size={15} /></button></div>
    <div className="metric-grid"><Metric label="Active destinations" value={metrics ? String(metrics.destinations) : '—'} change={metrics ? 'Stored catalogue count' : 'Waiting for API'} icon={Globe2} tone="blue" /><Metric label="Posts this month" value={metrics ? String(metrics.posts_30d) : '—'} change={metrics ? 'Stored job count · 30 days' : 'Waiting for API'} icon={Radio} tone="teal" /><Metric label="Success rate" value={metrics?.success_rate == null ? '—' : `${metrics.success_rate}%`} change={metrics ? 'Calculated from stored jobs' : 'Waiting for API'} icon={Gauge} tone="orange" /><Metric label="Certified destinations" value={metrics ? String(metrics.certified) : '—'} change={metrics ? 'Certified or simulated runs' : 'Waiting for API'} icon={BarChart3} tone="navy" /></div>
    <div className="dashboard-grid"><section className="panel performance-panel"><div className="panel-header"><div><h2>Distribution performance</h2><p>Successful posts across all certified destinations</p></div><button className="select-button">Last 30 days <ChevronDown size={15} /></button></div><div className="chart-area"><div className="chart-y"><span>200</span><span>150</span><span>100</span><span>50</span><span>0</span></div><div className="chart"><div className="grid-line line-1" /><div className="grid-line line-2" /><div className="grid-line line-3" /><div className="grid-line line-4" /><svg viewBox="0 0 700 190" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2c7be5" stopOpacity=".26" /><stop offset="1" stopColor="#2c7be5" stopOpacity="0" /></linearGradient></defs><path d="M0,150 C38,142 42,116 75,124 S120,133 145,98 S184,100 218,110 S248,88 278,91 S315,122 345,91 S382,80 410,76 S450,92 480,62 S512,72 540,52 S578,70 610,38 S660,54 700,23 L700,190 L0,190 Z" fill="url(#chartFill)" /><path d="M0,150 C38,142 42,116 75,124 S120,133 145,98 S184,100 218,110 S248,88 278,91 S315,122 345,91 S382,80 410,76 S450,92 480,62 S512,72 540,52 S578,70 610,38 S660,54 700,23" fill="none" stroke="#2c7be5" strokeWidth="3" strokeLinecap="round" /></svg><div className="chart-x"><span>May 26</span><span>Jun 02</span><span>Jun 09</span><span>Jun 16</span><span>Jun 23</span></div></div></div><div className="chart-legend"><span><i className="legend-blue" />Successful posts</span><span><i className="legend-muted" />Target: 180 posts</span></div></section><section className="panel network-panel"><div className="panel-header"><div><h2>Network health</h2><p>Current destination status</p></div><button className="text-button" onClick={() => onNavigate('catalogue')}>View all <ArrowUpRight size={15} /></button></div><div className="health-ring"><div className="ring"><div><strong>91%</strong><small>healthy</small></div></div><div className="health-list"><div><i className="health-good" /><span>Certified & healthy</span><b>18</b></div><div><i className="health-warn" /><span>Needs review</span><b>4</b></div><div><i className="health-muted" /><span>Not certified</span><b>2</b></div></div></div><div className="health-footer"><ShieldCheck size={15} />Next recertification in <strong>6 days</strong></div></section></div>
    <section className="panel destinations-panel"><div className="panel-header"><div><h2>Recent destinations</h2><p>{rows.length ? 'Loaded from the stored catalogue' : 'No destinations returned by the API'}</p></div><button className="text-button" onClick={() => onNavigate('catalogue')}>Open catalogue <ArrowUpRight size={15} /></button></div><DestinationTable compact destinations={rows} onNotify={onNotify} /></section>
    <div className="quick-grid"><button className="quick-card" onClick={() => onNavigate('catalogue')}><div className="quick-icon blue"><Globe2 size={18} /></div><span><strong>Grow your network</strong><small>Add destinations to your catalogue</small></span><ArrowUpRight size={16} /></button><button className="quick-card" onClick={() => onNavigate('rules')}><div className="quick-icon orange"><ListFilter size={18} /></div><span><strong>Review posting rules</strong><small>2 rules need your attention</small></span><ArrowUpRight size={16} /></button><button className="quick-card" onClick={() => onNotify(simulation ? 'Simulation export prepared' : 'Live export is unavailable')}><div className="quick-icon teal"><UploadCloud size={18} /></div><span><strong>Export activity</strong><small>Download your latest report</small></span><ArrowUpRight size={16} /></button></div>
  </>;
}

function toDestination(item: ApiDestination): Destination { return { name: item.name, platform: item.platform_key, surface: item.surface, audience: item.audience_tags.join(' · ') || 'Unspecified audience', score: item.relevance_score ?? 0, status: item.certification_status === 'certified' ? 'Live' : item.certification_status === 'simulated' ? 'Simulated' : item.certification_status === 'demoted' ? 'Review' : 'Ready', last: item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '—', color: '#2c7be5' }; }

function Metric({ label, value, change, icon: Icon, tone }: { label: string; value: string; change: string; icon: typeof Globe2; tone: string }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-change">{change}</span></div>; }

function DestinationTable({ compact = false, destinations: rows = destinations, onNotify }: { compact?: boolean; destinations?: Destination[]; onNotify: (message: string) => void }) { return <div className="table-wrap"><table><thead><tr><th>Destination</th><th>Platform</th><th>Audience</th><th>Relevance</th><th>Status</th><th>Last activity</th><th /></tr></thead><tbody>{rows.slice(0, compact ? 4 : undefined).map((item) => <tr key={item.name}><td><div className="destination-cell"><span className="destination-logo" style={{ background: item.color }}>{item.name.charAt(0)}</span><strong>{item.name}</strong></div></td><td><span className="platform-tag">{item.platform}</span></td><td>{item.audience}</td><td><span className="score">{Array.from({ length: 5 }).map((_, index) => <i key={index} className={index < item.score ? 'filled' : ''}>★</i>)}</span></td><td><StatusPill status={item.status} /></td><td>{item.last}</td><td><button className="row-menu" onClick={() => onNotify(`${item.name} selected`)}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div>; }
function StatusPill({ status }: { status: Status }) { return <span className={`status-pill ${status.toLowerCase()}`}><i />{status}</span>; }

function Catalogue({ destinations: rows, query, setQuery, onImport, onNotify }: { destinations: Destination[]; query: string; setQuery: (value: string) => void; onImport: () => void; onNotify: (message: string) => void }) { return <><PageIntro eyebrow="Network intelligence" title="Destination catalogue" description="Curate, score, and certify the places where your content belongs." action={<><button className="button secondary" onClick={onImport}><FileUp size={16} />Import CSV</button><button className="button primary" onClick={() => onNotify('New destination form opened')}><Plus size={16} />Add destination</button></>} /><div className="catalogue-summary"><div><strong>24</strong><span>total destinations</span></div><div><strong>18</strong><span>certified</span></div><div><strong>4</strong><span>pending review</span></div><div><strong>2</strong><span>not connected</span></div><div className="catalogue-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search destinations..." /></div></div><section className="panel catalogue-panel"><div className="panel-header"><div><h2>All destinations</h2><p>Sorted by relevance to your audience</p></div><div className="table-actions"><button className="filter-button"><ListFilter size={15} />Filters <span>2</span></button><button className="filter-button"><SlidersHorizontal size={15} />Columns</button></div></div><DestinationTable destinations={rows} onNotify={onNotify} /></section></>; }

function Publishing({ onNotify, simulation }: { onNotify: (message: string) => void; simulation: boolean }) { return <><PageIntro eyebrow="Distribution pipeline" title="Publishing jobs" description="Track every rendition from validation to destination delivery." action={<button className="button primary" onClick={() => onNotify('Publishing job composer opened')}><Plus size={16} />New publishing job</button>} /><div className="job-stats"><div><span className="stat-dot blue" />Queued <strong>3</strong></div><div><span className="stat-dot orange" />Needs review <strong>2</strong></div><div><span className="stat-dot green" />Published today <strong>18</strong></div><div><span className="stat-dot red" />Failed <strong>1</strong></div></div><section className="panel"><div className="panel-header"><div><h2>Recent jobs</h2><p>{simulation ? 'Simulated adapter activity · no live posts' : 'Live adapter activity'}</p></div><button className="filter-button"><RefreshCw size={15} />Refresh</button></div><div className="jobs-list"><Job title="The state of sustainable growth" destinations="Dev.to · Lemmy.World · Indie Hackers" status="Published" time="Today, 09:42" progress={100} onClick={() => onNotify('Job details opened')} /><Job title="Building in public: week 12" destinations="Founders Circle · The Growth Journal" status="Processing" time="Today, 09:38" progress={68} onClick={() => onNotify('Job is still processing')} /><Job title="Why distribution is a product" destinations="DEV Community · Lemmy.World" status="Needs review" time="Today, 08:56" progress={42} onClick={() => onNotify('Review queue opened')} /><Job title="Community-led growth notes" destinations="Indie Hackers" status="Failed" time="Yesterday, 18:12" progress={0} onClick={() => onNotify('Failure details opened')} /></div></section></>; }
function Job({ title, destinations: target, status, time, progress, onClick }: { title: string; destinations: string; status: string; time: string; progress: number; onClick: () => void }) { return <button className="job-row" onClick={onClick}><div className="job-status-icon"><Cloud size={16} /></div><div className="job-main"><strong>{title}</strong><span>{target}</span></div><div className="job-progress"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{progress}%</small></div><div className={`job-label ${status.toLowerCase().replace(' ', '-')}`}>{status}</div><time>{time}</time><MoreHorizontal size={17} /></button>; }

function Rules({ onNotify }: { onNotify: (message: string) => void }) { return <><PageIntro eyebrow="Safety rails" title="Posting rules" description="Make every destination’s expectations explicit before content leaves your workspace." action={<button className="button primary" onClick={() => onNotify('Rule builder opened')}><Plus size={16} />Create rule</button>} /><div className="rule-alert"><div className="alert-icon"><CircleHelp size={18} /></div><div><strong>2 destinations need rule review</strong><span>Suggested rules from recent catalogue imports are waiting for approval.</span></div><button onClick={() => onNotify('Rule review queue opened')}>Review suggestions <ArrowUpRight size={15} /></button></div><div className="rule-grid"><RuleCard title="Frequency & cooldown" description="Protect communities from repetitive publishing." icon={RefreshCw} enabled="18 destinations" color="blue" onNotify={onNotify} /><RuleCard title="Self-promotion" description="Respect destinations that prohibit promotional content." icon={Users} enabled="6 destinations" color="orange" onNotify={onNotify} /><RuleCard title="Links & disclosure" description="Apply canonical URL and AI disclosure policies." icon={BookOpen} enabled="12 destinations" color="teal" onNotify={onNotify} /><RuleCard title="Media compatibility" description="Validate formats before a connector is called." icon={Cloud} enabled="9 destinations" color="navy" onNotify={onNotify} /></div><section className="panel rules-table"><div className="panel-header"><div><h2>Destination policies</h2><p>Rules are checked before every publishing job</p></div><button className="filter-button"><ListFilter size={15} />Filter</button></div><div className="policy-list"><Policy name="DEV Community" type="Developer blog" cap="3 / week" promo="Allowed with disclosure" link="Canonical only" status="Active" /><Policy name="Lemmy.World" type="Community" cap="1 / week" promo="Not allowed" link="Allowed" status="Active" /><Policy name="The Growth Journal" type="Publication" cap="2 / month" promo="Review required" link="Allowed" status="Needs review" /></div></section></>; }
function RuleCard({ title, description, icon: Icon, enabled, color, onNotify }: { title: string; description: string; icon: typeof RefreshCw; enabled: string; color: string; onNotify: (message: string) => void }) { return <button className="rule-card" onClick={() => onNotify(`${title} rules opened`)}><div className={`rule-icon ${color}`}><Icon size={18} /></div><div><strong>{title}</strong><p>{description}</p><span>{enabled}</span></div><ArrowUpRight size={17} /></button>; }
function Policy({ name, type, cap, promo, link, status }: { name: string; type: string; cap: string; promo: string; link: string; status: string }) { return <div className="policy-row"><div><strong>{name}</strong><small>{type}</small></div><span>{cap}</span><span>{promo}</span><span>{link}</span><StatusPill status={status === 'Active' ? 'Live' : 'Review'} /><MoreHorizontal size={17} /></div>; }

function Certification({ onNotify }: { onNotify: (message: string) => void }) { return <><PageIntro eyebrow="Trust layer" title="Destination certification" description="Prove a connector can publish, verify, and clean up before you trust it with live distribution." action={<button className="button primary" onClick={() => onNotify('Certification run started in simulation mode')}><ClipboardCheck size={16} />Run certification</button>} /><div className="cert-hero"><div className="cert-seal"><ShieldCheck size={34} /></div><div><strong>18 certified destinations</strong><p>Every certified destination passed publish, live URL, status, and cleanup checks.</p><span><Check size={14} />Last full run completed 2 hours ago</span></div><div className="cert-score"><strong>91%</strong><small>network confidence</small></div></div><section className="panel"><div className="panel-header"><div><h2>Certification history</h2><p>Evidence is retained with secrets removed</p></div><button className="filter-button"><ListFilter size={15} />Filter</button></div><div className="cert-list"><CertificationRow name="Lemmy.World" connector="Lemmy · simulation" date="Today, 09:42" result="Passed" onClick={() => onNotify('Certification evidence opened')} /><CertificationRow name="DEV Community" connector="Dev.to · simulation" date="Jun 21, 16:20" result="Passed" onClick={() => onNotify('Certification evidence opened')} /><CertificationRow name="The Growth Journal" connector="Ghost · needs review" date="Jun 20, 11:08" result="Failed" onClick={() => onNotify('Failure reason: live URL was not returned')} /></div></section><div className="cert-note"><Terminal size={17} /><span><strong>Simulation is honest by design.</strong> Mock certification proves workflow behavior but never upgrades a destination to live certified status.</span></div></>; }
function CertificationRow({ name, connector, date, result, onClick }: { name: string; connector: string; date: string; result: string; onClick: () => void }) { return <button className="cert-row" onClick={onClick}><div className="cert-row-icon"><ShieldCheck size={16} /></div><div><strong>{name}</strong><small>{connector}</small></div><time>{date}</time><span className={result === 'Passed' ? 'result passed' : 'result failed'}><i />{result}</span><ArrowUpRight size={16} /></button>; }

function Connectors({ onNotify }: { onNotify: (message: string) => void }) { const items = [['Discourse', 'Forum communities', 'L3', 'Ready', '#ef8f35'], ['Lemmy', 'Open communities', 'L3', 'Simulated', '#5ab39b'], ['Dev.to', 'Developer publishing', 'L4', 'Ready', '#111827'], ['Ghost', 'Independent publications', 'L3', 'Review', '#d46a58'], ['Signed webhook', 'Partner endpoints', 'L3', 'Ready', '#71819b'], ['Assisted posting', 'Human-in-the-loop', 'L1', 'Simulated', '#2c7be5']]; return <><PageIntro eyebrow="Integration layer" title="Connectors" description="One connector implementation, many destination configurations." action={<button className="button secondary" onClick={() => onNotify('Connector manifest upload opened')}><UploadCloud size={16} />Add connector</button>} /><div className="connector-callout"><div className="callout-icon"><Database size={19} /></div><div><strong>Appendix A contract ready</strong><span>Every core connector exposes validate, publish, status, and delete. Optional metrics and assist-pack methods are capability-gated.</span></div><button onClick={() => onNotify('Connector contract documentation opened')}>View contract <ArrowUpRight size={15} /></button></div><div className="connector-grid">{items.map(([name, description, level, status, color]) => <button className="connector-card" key={name} onClick={() => onNotify(`${name} settings opened`)}><div className="connector-logo" style={{ background: color }}>{name.charAt(0)}</div><div className="connector-card-top"><strong>{name}</strong><StatusPill status={status as Status} /></div><p>{description}</p><div className="connector-card-footer"><span>Capability level <b>{level}</b></span><MoreHorizontal size={17} /></div></button>)}</div></>; }

function ActivityView() { const logs = [['09:42', 'Lemmy.World certification completed', 'certification', 'success'], ['09:38', 'Publishing job entered processing', 'publishing', 'info'], ['09:12', 'Rule suggestion created for The Growth Journal', 'rules', 'warning'], ['08:56', 'Content rendition blocked: title exceeds destination limit', 'validation', 'error'], ['Yesterday', 'Catalogue import completed · 48 rows accepted', 'catalogue', 'success']]; return <><PageIntro eyebrow="Observability" title="Activity log" description="A transparent record of rules, jobs, certifications, and catalogue changes." action={<button className="button secondary"><DownloadIcon />Export log</button>} /><section className="panel activity-panel"><div className="panel-header"><div><h2>Workspace events</h2><p>Structured events with correlation IDs and redacted details</p></div><div className="table-actions"><button className="filter-button"><ListFilter size={15} />All events</button><button className="filter-button"><RefreshCw size={15} />Refresh</button></div></div><div className="activity-list">{logs.map(([time, message, type, level]) => <div className="activity-row" key={message}><time>{time}</time><span className={`activity-dot ${level}`} /><div><strong>{message}</strong><small>{type} · simulation · correlation rch_8f3a91</small></div><MoreHorizontal size={17} /></div>)}</div></section></>; }
function DownloadIcon() { return <ArrowUpRight size={16} />; }

function ImportModal({ onClose, onNotify }: { onClose: () => void; onNotify: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const selectFile = (selected: File | null | undefined) => {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.csv')) { setError('Please select a .csv file'); return; }
    setError('');
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) { setError('Choose a CSV file first'); return; }
    setUploading(true);
    setError('');
    try {
      const result = await importCatalogue(file);
      const summary = `${result.accepted} accepted, ${result.duplicates} duplicates, ${result.rejected} rejected`;
      onNotify(`Import complete: ${summary}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return <div className="modal-backdrop"><div className="modal">
    <div className="modal-header"><div><div className="eyebrow">Catalogue tools</div><h2>Import destinations</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
    <div
      className={`drop-zone${dragging ? ' drop-zone-active' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files[0]); }}
      onClick={() => inputRef.current?.click()}
    >
      <UploadCloud size={28} />
      <strong>{file ? file.name : 'Drop a CSV here'}</strong>
      <span>{file ? `${(file.size / 1024).toFixed(1)} KB — click to choose a different file` : 'or click to choose a file from your computer'}</span>
      <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => selectFile(e.target.files?.[0])} />
    </div>
    {error && <div className="import-error">{error}</div>}
    <div className="import-rules"><div><Check size={14} />Normalises URLs and detects duplicates</div><div><Check size={14} />Validates all 21 catalogue fields</div><div><Check size={14} />Reports rejected rows without hiding them</div></div>
    <div className="modal-footer"><button className="button ghost" onClick={onClose} disabled={uploading}>Cancel</button><button className="button primary" onClick={handleUpload} disabled={!file || uploading}>{uploading ? 'Uploading...' : 'Start validation'}</button></div>
  </div></div>;
}

export default App;
