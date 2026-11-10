import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, type AdmissionClass, type MyHold, type HoldStatus } from "./api";
import "./App.css";

type Portal = "home" | "student" | "admin";

const STUDENT_KEY = "school-admission-student-id";
const STUDENT_ID_PATTERN = /^[0-9]{17}$/;

function portalFromPath(path: string): Portal {
  if (path === "/student" || path.startsWith("/student/")) return "student";
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  return "home";
}

function effectiveStatus(hold: MyHold, now: number): HoldStatus {
  if (hold.status === "HELD" && Date.parse(hold.expiresAt) <= now) return "EXPIRED";
  return hold.status;
}

function remainingTime(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function Icon({ name, size = 22 }: { name: "school" | "student" | "admin" | "arrow" | "check" | "clock" | "layers" | "refresh" | "shield"; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    school: <><path d="M3 10 12 4l9 6" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /><path d="M3 20h18" /></>,
    student: <><path d="m2 10 10-5 10 5-10 5-10-5Z" /><path d="M6 12.5v4.5c3.7 2.8 8.3 2.8 12 0v-4.5" /><path d="M22 10v6" /></>,
    admin: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    arrow: <><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
    refresh: <><path d="M20 7a8 8 0 0 0-13-2L4 8" /><path d="M4 3v5h5" /><path d="M4 17a8 8 0 0 0 13 2l3-3" /><path d="M20 21v-5h-5" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function SeatStats({ item }: { item: AdmissionClass }) {
  const used = item.heldSeats + item.confirmedSeats;
  const percent = item.totalSeats > 0 ? Math.min(100, Math.max(0, (used / item.totalSeats) * 100)) : 0;
  return (
    <>
      <div className="seat-numbers" aria-label={`Total ${item.totalSeats}, held ${item.heldSeats}, confirmed ${item.confirmedSeats}, available ${item.availableSeats}`}>
        <div><span>Total seats</span><strong>{item.totalSeats}</strong></div>
        <div><span>Held</span><strong>{item.heldSeats}</strong></div>
        <div><span>Confirmed</span><strong>{item.confirmedSeats}</strong></div>
        <div className="available-number"><span>Available</span><strong>{item.availableSeats}</strong></div>
      </div>
      <div className="seat-meter" role="progressbar" aria-label={`Occupied seats for ${item.name}`} aria-valuemin={0}
        aria-valuemax={item.totalSeats} aria-valuenow={Math.min(item.totalSeats, used)}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </>
  );
}

export default function App() {
  const [portal, setPortal] = useState<Portal>(() => portalFromPath(window.location.pathname));
  const [studentId, setStudentId] = useState(() => localStorage.getItem(STUDENT_KEY) ?? "");
  const [classes, setClasses] = useState<AdmissionClass[]>([]);
  const [holds, setHolds] = useState<MyHold[]>([]);
  const [className, setClassName] = useState("");
  const [seatCount, setSeatCount] = useState("50");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const refreshGeneration = useRef(0);

  const validStudent = STUDENT_ID_PATTERN.test(studentId);

  function navigate(next: Portal) {
    refreshGeneration.current++;
    window.history.pushState({}, "", next === "home" ? "/" : `/${next}`);
    setPortal(next);
    setSuccess("");
    setActionError("");
    setConnectionError("");
    setLoading(true);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  useEffect(() => {
    const onPopState = () => {
      refreshGeneration.current++;
      setLoading(true);
      setPortal(portalFromPath(window.location.pathname));
      setSuccess("");
      setActionError("");
      setConnectionError("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (validStudent) localStorage.setItem(STUDENT_KEY, studentId);
    else localStorage.removeItem(STUDENT_KEY);
  }, [studentId, validStudent]);

  const refresh = useCallback(async () => {
    if (portal === "home") return;
    const requestId = ++refreshGeneration.current;
    try {
      const [nextClasses, nextHolds] = await Promise.all([
        api.getClasses(),
        portal === "student" && validStudent
          ? api.getMyHolds(studentId)
          : Promise.resolve([] as MyHold[])
      ]);
      if (requestId !== refreshGeneration.current) return;
      setClasses(nextClasses);
      if (portal === "student") setHolds(nextHolds);
      setConnectionError("");
    } catch (error) {
      if (requestId === refreshGeneration.current) setConnectionError(errorText(error));
    } finally {
      if (requestId === refreshGeneration.current) setLoading(false);
    }
  }, [portal, studentId, validStudent]);

  useEffect(() => {
    if (portal === "home") return;
    setLoading(true);
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => {
      window.clearInterval(interval);
      refreshGeneration.current++;
    };
  }, [portal, refresh]);

  useEffect(() => {
    if (portal !== "student") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [portal]);

  async function perform(action: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true);
    setSuccess("");
    setActionError("");
    try {
      await action();
      await refresh();
      setSuccess(message);
      return true;
    } catch (error) {
      setActionError(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = className.trim();
    const seats = Number(seatCount);
    if (!name || !Number.isSafeInteger(seats) || seats < 1 || seats > 2147483647) {
      setActionError("Enter a class name and a positive whole number of seats.");
      return;
    }
    if (await perform(() => api.createClass(name, seats), "Class created successfully.")) {
      setClassName("");
    }
  }

  const notices = (
    <div className="notices" aria-live="polite">
      {connectionError && <p className="alert error" role="alert">Connection problem: {connectionError}</p>}
      {actionError && <p className="alert error" role="alert">{actionError}</p>}
      {success && <p className="alert success" role="status">{success}</p>}
    </div>
  );

  return (
    <div className="site-shell">
      <header className="site-nav">
        <div className="nav-inner">
          <button className="brand" type="button" onClick={() => navigate("home")} aria-label="Go to welcome page">
            <span className="brand-mark"><Icon name="school" size={21} /></span>
            <span><strong>School Admission</strong><small>ONLINE ADMISSION PORTAL</small></span>
          </button>
          {portal === "home" ? (
            <span className="nav-meta">Simple, fair &amp; transparent admissions</span>
          ) : (
            <div className="nav-actions">
              <span className="portal-indicator">{portal === "student" ? "Student portal" : "Admin portal"}</span>
              <button type="button" className="nav-home" onClick={() => navigate("home")}>← Back to home</button>
            </div>
          )}
        </div>
      </header>

      {portal === "home" && (
        <main>
          <section className="hero">
            <div className="container hero-inner">
              <div className="hero-copy">
                <span className="kicker"><span className="kicker-dot" /> Welcome to our admission platform</span>
                <h1>Your next chapter <em>starts here.</em></h1>
                <p className="hero-lead">One place to manage school admissions, reserve seats, and track applications. Choose the portal that matches what you want to do.</p>
                <div className="hero-highlights">
                  <span><Icon name="check" size={16} /> First come, first served</span>
                  <span><Icon name="clock" size={16} /> Time-limited seat reservations</span>
                </div>
              </div>
              <div className="hero-panel" aria-label="How school admission works">
                <div className="hero-panel-top"><span className="panel-symbol"><Icon name="layers" size={25} /></span><span>YOUR ADMISSION JOURNEY</span></div>
                <div className="journey-step"><span>01</span><div><strong>Find your class</strong><small>Browse classes and available seats</small></div></div>
                <div className="journey-step"><span>02</span><div><strong>Reserve your seat</strong><small>Hold a seat before the deadline</small></div></div>
                <div className="journey-step"><span>03</span><div><strong>Confirm admission</strong><small>Complete the simulated payment</small></div></div>
                <div className="journey-foot"><Icon name="shield" size={16} /> Seat availability is verified by the system</div>
              </div>
            </div>
          </section>

          <section className="container choose-section" aria-labelledby="choose-title">
            <div className="section-intro">
              <span className="eyebrow">GET STARTED</span>
              <h2 id="choose-title">Where would you like to go?</h2>
              <p>Two dedicated spaces, each with the tools you need.</p>
            </div>
            <div className="portal-grid">
              <article className="portal-card student-card">
                <div className="portal-icon"><Icon name="student" size={29} /></div>
                <span className="card-label">FOR STUDENTS &amp; PARENTS</span>
                <h3>Student Portal</h3>
                <p>Explore your admission options and manage your own application from reservation through confirmation.</p>
                <ul>
                  <li><Icon name="check" size={16} /> View classes and open seats</li>
                  <li><Icon name="check" size={16} /> Apply using a 17-digit student ID</li>
                  <li><Icon name="check" size={16} /> Confirm, cancel and track applications</li>
                </ul>
                <button type="button" className="portal-button student-button" onClick={() => navigate("student")}>Open Student Portal <Icon name="arrow" size={19} /></button>
              </article>
              <article className="portal-card admin-card">
                <div className="portal-icon"><Icon name="admin" size={27} /></div>
                <span className="card-label">FOR SCHOOL ADMINISTRATORS</span>
                <h3>Admin Portal</h3>
                <p>Organize class and shift intake, set seat limits, and monitor capacity across the school.</p>
                <ul>
                  <li><Icon name="check" size={16} /> Create classes and shifts</li>
                  <li><Icon name="check" size={16} /> Set the total number of seats</li>
                  <li><Icon name="check" size={16} /> Monitor held, confirmed and available seats</li>
                </ul>
                <button type="button" className="portal-button admin-button" onClick={() => navigate("admin")}>Open Admin Portal <Icon name="arrow" size={19} /></button>
              </article>
            </div>
            <p className="home-note">Please note: reservations are temporary. An unconfirmed seat becomes available to others when its hold expires.</p>
          </section>
        </main>
      )}

      {portal === "student" && (
        <main className="container portal-main">
          <section className="portal-heading">
            <div><span className="eyebrow">STUDENT AREA</span><h1>Student Admission Portal</h1><p>Find your class, reserve a seat, and manage your admission—all in one place.</p></div>
            <div className="live-label"><span /> Seat counts refresh every 3 seconds</div>
          </section>
          {notices}
          <section className="panel identity-panel" aria-labelledby="identity-title">
            <div className="panel-icon"><Icon name="student" size={25} /></div>
            <div className="identity-body"><h2 id="identity-title">Your student details</h2><p>Enter the student's 17-digit birth registration number to apply and view existing applications.</p>
              <label htmlFor="student-id">Birth registration number</label>
              <div className="identity-input-row">
                <input id="student-id" value={studentId} inputMode="numeric" maxLength={17} autoComplete="off"
                  placeholder="Enter 17 digits" onChange={e => { refreshGeneration.current++; setStudentId(e.target.value.replace(/[^0-9]/g, "").slice(0, 17)); setHolds([]); }}
                  aria-describedby="student-id-hint" />
                <span className={`input-state ${validStudent ? "valid" : ""}`}>{validStudent ? "✓ Valid ID" : `${studentId.length}/17 digits`}</span>
              </div>
              <small id="student-id-hint">{validStudent ? "Your ID is remembered in this browser for your next visit." : "Only a valid 17-digit ID can create or manage an application."}</small>
            </div>
          </section>

          <section className="section-block" aria-labelledby="classes-title">
            <div className="section-line"><div><span className="eyebrow">EXPLORE</span><h2 id="classes-title">Available classes</h2><p>Choose a class or shift to temporarily reserve one seat.</p></div><button type="button" className="quiet-button" onClick={() => void refresh()}><Icon name="refresh" size={16} /> Refresh</button></div>
            {loading && <div className="empty-state">Loading classes...</div>}
            {!loading && classes.length === 0 && <div className="empty-state">No classes have been published yet. Please check back soon.</div>}
            <div className="class-grid">
              {classes.map(item => {
                const alreadyApplied = holds.some(h => h.classId === item.id && ["HELD", "CONFIRMED"].includes(effectiveStatus(h, now)));
                return <article className="class-card" key={item.id}>
                  <div className="class-card-heading"><span className="class-icon"><Icon name="layers" size={20} /></span><span className={`availability-tag ${item.availableSeats < 1 ? "full" : ""}`}>{item.availableSeats > 0 ? "Seats available" : "Full"}</span></div>
                  <h3>{item.name}</h3><SeatStats item={item} />
                  <button className="primary-button stretch" type="button" disabled={busy || !validStudent || item.availableSeats <= 0 || alreadyApplied}
                    onClick={() => void perform(() => api.createHold(item.id, studentId), `Seat reserved in ${item.name}. Confirm before the timer ends.`)}>
                    {alreadyApplied ? "Already applied" : item.availableSeats <= 0 ? "No seats available" : !validStudent ? "Enter student ID to apply" : "Reserve a seat"}
                  </button>
                </article>;
              })}
            </div>
          </section>

          <section className="section-block" aria-labelledby="my-holds-title">
            <div className="section-line"><div><span className="eyebrow">YOUR JOURNEY</span><h2 id="my-holds-title">My applications</h2><p>Track active holds, confirm admission, or cancel an application.</p></div></div>
            {!validStudent && <div className="empty-state">Enter your student ID above to see your applications.</div>}
            {validStudent && !loading && holds.length === 0 && <div className="empty-state">You have no applications yet. Choose a class above to get started.</div>}
            {validStudent && <div className="application-grid">{holds.map(hold => {
              const status = effectiveStatus(hold, now);
              const active = status === "HELD";
              return <article key={hold.holdId} className="application-card">
                <div className="section-line app-title"><h3>{hold.className}</h3><span className={`status ${status.toLowerCase()}`}>{status}</span></div>
                <p className="hold-reference">Reference: <span>{hold.holdId}</span></p>
                {active && <p className="countdown"><Icon name="clock" size={18} /> Time remaining: <strong>{remainingTime(hold.expiresAt, now)}</strong></p>}
                {status === "EXPIRED" && <p className="state-note">This reservation expired and its seat was released.</p>}
                {status === "CONFIRMED" && <p className="state-note success-note">Admission confirmed successfully.</p>}
                {status === "CANCELLED" && <p className="state-note">This application was cancelled.</p>}
                <div className="card-actions">
                  {active && <><button type="button" className="primary-button" disabled={busy} onClick={() => void perform(() => api.confirmHold(hold.holdId, studentId), "Admission confirmed. Payment simulated successfully.")}>Pay &amp; confirm (demo)</button><button type="button" className="outline-button" disabled={busy} onClick={() => void perform(() => api.cancelHold(hold.holdId, studentId), "Reservation cancelled.")}>Cancel hold</button></>}
                  <button type="button" className="text-button" disabled={busy} onClick={() => void perform(async () => { const result = await api.getHold(hold.holdId); if (result.status !== status) throw new Error(`Current status: ${result.status}. Refresh to see the latest details.`); }, `Status checked: ${status}.`)}>Check status <Icon name="arrow" size={15} /></button>
                </div>
              </article>;
            })}</div>}
          </section>
        </main>
      )}

      {portal === "admin" && (
        <main className="container portal-main">
          <section className="portal-heading"><div><span className="eyebrow">SCHOOL MANAGEMENT</span><h1>Admin Portal</h1><p>Create classes, configure seat capacity, and monitor admission availability.</p></div><div className="live-label"><span /> Seat counts refresh every 3 seconds</div></section>
          {notices}
          <section className="admin-layout">
            <section className="panel admin-form-panel" aria-labelledby="create-class-title">
              <div className="panel-icon"><Icon name="admin" size={24} /></div>
              <h2 id="create-class-title">Create a new class</h2><p className="panel-subtitle">Each class and shift has its own seat capacity. For example, “Class 6 – Morning Shift”.</p>
              <form onSubmit={e => void createClass(e)} className="admin-form">
                <label htmlFor="class-name">Class / shift name</label>
                <input id="class-name" value={className} required maxLength={150} placeholder="e.g., Class 6 - Morning Shift" onChange={e => setClassName(e.target.value)} />
                <label htmlFor="seat-count">Total seat capacity</label>
                <input id="seat-count" value={seatCount} type="number" min={1} max={2147483647} step={1} required onChange={e => setSeatCount(e.target.value)} />
                <button type="submit" disabled={busy} className="primary-button stretch">{busy ? "Saving..." : "Create class"} <Icon name="arrow" size={17} /></button>
              </form>
              <p className="form-helper">Seat capacity is set when you create the class. This assignment does not provide an endpoint to edit existing classes.</p>
            </section>
            <section className="panel admin-summary" aria-labelledby="overview-title">
              <span className="eyebrow">AT A GLANCE</span><h2 id="overview-title">Admissions overview</h2>
              <div className="summary-metrics"><div><span>Total classes</span><strong>{classes.length}</strong></div><div><span>Total seats</span><strong>{classes.reduce((sum, c) => sum + c.totalSeats, 0)}</strong></div><div><span>Held seats</span><strong>{classes.reduce((sum, c) => sum + c.heldSeats, 0)}</strong></div><div><span>Confirmed seats</span><strong>{classes.reduce((sum, c) => sum + c.confirmedSeats, 0)}</strong></div></div>
              <div className="summary-note"><Icon name="shield" size={19} /> Figures are read directly from your admission API and reflect the current database state.</div>
            </section>
          </section>
          <section className="section-block" aria-labelledby="admin-class-list-title">
            <div className="section-line"><div><span className="eyebrow">CAPACITY MONITOR</span><h2 id="admin-class-list-title">Classes &amp; seat availability</h2><p>Track total seats, temporary holds, and confirmed admissions for every class.</p></div><button type="button" className="quiet-button" onClick={() => void refresh()}><Icon name="refresh" size={16} /> Refresh</button></div>
            {loading && <div className="empty-state">Loading classes...</div>}
            {!loading && classes.length === 0 && <div className="empty-state">No classes yet. Create the first class using the form above.</div>}
            <div className="class-grid">{classes.map(item => <article className="class-card" key={item.id}><div className="class-card-heading"><span className="class-icon"><Icon name="layers" size={20} /></span><span className={`availability-tag ${item.availableSeats < 1 ? "full" : ""}`}>{item.availableSeats > 0 ? `${item.availableSeats} open` : "Full"}</span></div><h3>{item.name}</h3><SeatStats item={item} /></article>)}</div>
          </section>
          <p className="security-note"><Icon name="shield" size={16} /> Demo portal separation only: the current backend does not enforce admin authentication. Add authorization before any real-world deployment.</p>
        </main>
      )}

      <footer className="site-footer"><div className="container"><span>© School Admission System</span><span>Built for simple, first-come-first-served admissions</span></div></footer>
    </div>
  );
}
