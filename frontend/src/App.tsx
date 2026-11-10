import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type AdmissionClass, type MyHold, type HoldStatus } from "./api";
import "./App.css";

const STUDENT_KEY = "school-admission-student-id";
const STUDENT_ID_PATTERN = /^[0-9]{17}$/;

function effectiveStatus(hold: MyHold, now: number): HoldStatus {
  if (hold.status === "HELD" && Date.parse(hold.expiresAt) <= now) {
    return "EXPIRED";
  }
  return hold.status;
}

function remainingTime(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export default function App() {
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

  const validStudent = STUDENT_ID_PATTERN.test(studentId);

  const refresh = useCallback(async () => {
    try {
      const [nextClasses, nextHolds] = await Promise.all([
        api.getClasses(),
        validStudent ? api.getMyHolds(studentId) : Promise.resolve([] as MyHold[])
      ]);
      setClasses(nextClasses);
      setHolds(nextHolds);
      setConnectionError("");
    } catch (error) {
      setConnectionError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [studentId, validStudent]);

  useEffect(() => {
    if (validStudent) localStorage.setItem(STUDENT_KEY, studentId);
    else localStorage.removeItem(STUDENT_KEY);
  }, [studentId, validStudent]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

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
    if (!name || !Number.isInteger(seats) || seats <= 0) {
      setActionError("Enter a class name and a positive whole number of seats.");
      return;
    }
    const ok = await perform(() => api.createClass(name, seats), "Class created successfully.");
    if (ok) setClassName("");
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">SCHOOL ADMISSION PORTAL</p>
          <h1>School Admission System</h1>
          <p>Apply for seats, track reservations, and confirm admission.</p>
        </div>
        <div className="student-box">
          <label htmlFor="student-id">Student birth registration number</label>
          <input
            id="student-id"
            inputMode="numeric"
            maxLength={17}
            placeholder="17-digit number"
            value={studentId}
            onChange={e => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 17))}
          />
          <small>{validStudent ? "Student ID saved on this browser." : "Enter exactly 17 digits to apply."}</small>
        </div>
      </header>

      <main className="content">
        {connectionError && <p className="alert error" role="alert">Server error: {connectionError}</p>}
        {actionError && <p className="alert error" role="alert">{actionError}</p>}
        {success && <p className="alert success" role="status">{success}</p>}

        <section className="panel" aria-labelledby="admin-title">
          <h2 id="admin-title">Create a class <span className="muted">(School admin)</span></h2>
          <form onSubmit={e => void createClass(e)} className="form-row">
            <label>
              Class / shift name
              <input value={className} maxLength={150}
                placeholder="Class 6 - Morning Shift"
                onChange={e => setClassName(e.target.value)} required />
            </label>
            <label>
              Total seats
              <input type="number" min="1" step="1" value={seatCount}
                onChange={e => setSeatCount(e.target.value)} required />
            </label>
            <button type="submit" disabled={busy}>Create class</button>
          </form>
        </section>

        <section className="panel" aria-labelledby="classes-title">
          <div className="section-heading">
            <h2 id="classes-title">Available classes</h2>
            <span className="muted">Auto-updated every 3 seconds</span>
          </div>
          {loading && <p>Loading classes...</p>}
          {!loading && classes.length === 0 && <p>No classes yet. Create one above.</p>}
          <div className="cards">
            {classes.map(item => (
              <article className="class-card" key={item.id}>
                <h3>{item.name}</h3>
                <div className="stats">
                  <span>Total <strong>{item.totalSeats}</strong></span>
                  <span>Held <strong>{item.heldSeats}</strong></span>
                  <span>Confirmed <strong>{item.confirmedSeats}</strong></span>
                  <span>Available <strong>{item.availableSeats}</strong></span>
                </div>
                <button disabled={busy || !validStudent || item.availableSeats <= 0}
                  onClick={() => void perform(
                    () => api.createHold(item.id, studentId),
                    `Seat reserved for ${item.name}. Confirm before the deadline.`
                  )}>
                  {item.availableSeats <= 0 ? "No seats available" : "Apply now"}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="holds-title">
          <h2 id="holds-title">My applications</h2>
          {!validStudent && <p className="muted">Enter your 17-digit student ID above to view applications.</p>}
          {validStudent && holds.length === 0 && <p>No applications for this student yet.</p>}
          <div className="cards">
            {validStudent && holds.map(hold => {
              const status = effectiveStatus(hold, now);
              const active = status === "HELD";
              return (
                <article className="class-card" key={hold.holdId}>
                  <div className="section-heading">
                    <h3>{hold.className}</h3>
                    <span className={`status ${status.toLowerCase()}`}>{status}</span>
                  </div>
                  <p className="muted">Hold ID: {hold.holdId}</p>
                  {active && <p className="countdown">Time remaining: {remainingTime(hold.expiresAt, now)}</p>}
                  {status === "EXPIRED" && <p className="muted">Reservation expired; the seat was released.</p>}
                  <div className="actions">
                    <button disabled={busy || !active}
                      onClick={() => void perform(
                        () => api.confirmHold(hold.holdId, studentId),
                        "Admission confirmed. Payment simulated successfully."
                      )}>Pay fee (simulate)</button>
                    <button className="secondary" disabled={busy || !active}
                      onClick={() => void perform(
                        () => api.cancelHold(hold.holdId, studentId),
                        "Reservation cancelled."
                      )}>Cancel</button>
                    <button className="secondary" disabled={busy}
                      onClick={() => void perform(
                        () => api.getHold(hold.holdId), "Status checked."
                      )}>Check status</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
