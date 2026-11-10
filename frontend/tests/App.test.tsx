import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { api, type AdmissionClass, type MyHold } from '../src/api';

// These tests exercise the real React UI, but mock HTTP requests.
vi.mock('../src/api', () => ({
  api: {
    getClasses: vi.fn(),
    createClass: vi.fn(),
    createHold: vi.fn(),
    getHold: vi.fn(),
    getMyHolds: vi.fn(),
    confirmHold: vi.fn(),
    cancelHold: vi.fn(),
  },
}));

const STUDENT_ID = '20152691234567890';
const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const HOLD_ID = '22222222-2222-4222-8222-222222222222';
const STORAGE_KEY = 'school-admission-student-id';

const sampleClass: AdmissionClass = {
  id: CLASS_ID,
  name: 'Class 6 - Morning Shift',
  totalSeats: 5,
  heldSeats: 1,
  confirmedSeats: 1,
  availableSeats: 3,
};

function makeHold(overrides: Partial<MyHold> = {}): MyHold {
  return {
    holdId: HOLD_ID,
    classId: CLASS_ID,
    className: sampleClass.name,
    status: 'HELD',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  // jsdom doesn't implement scrolling; navigation in App calls scrollTo().
  vi.stubGlobal('scrollTo', vi.fn());

  vi.mocked(api.getClasses).mockResolvedValue([sampleClass]);
  vi.mocked(api.getMyHolds).mockResolvedValue([]);
  vi.mocked(api.createClass).mockResolvedValue({ id: CLASS_ID });
  vi.mocked(api.createHold).mockResolvedValue({ holdId: HOLD_ID });
  vi.mocked(api.confirmHold).mockResolvedValue({ holdId: HOLD_ID, status: 'CONFIRMED' });
  vi.mocked(api.cancelHold).mockResolvedValue(undefined);
  vi.mocked(api.getHold).mockResolvedValue({
    holdId: HOLD_ID, classId: CLASS_ID, status: 'HELD',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('School Admission frontend', () => {
  it('shows a landing page explaining both portals', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /your next chapter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open student portal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open admin portal/i })).toBeInTheDocument();
    expect(screen.getByText(/time-limited seat reservations/i)).toBeInTheDocument();
    expect(api.getClasses).not.toHaveBeenCalled();
  });

  it('keeps the student portal free of admin controls and enforces a 17-digit ID', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /open student portal/i }));

    expect(await screen.findByRole('heading', { name: 'Student Admission Portal' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: sampleClass.name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^create class/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enter student id to apply/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/birth registration number/i), {
      target: { value: STUDENT_ID },
    });
    await waitFor(() => expect(api.getMyHolds).toHaveBeenCalledWith(STUDENT_ID));
    const reserve = await screen.findByRole('button', { name: 'Reserve a seat' });
    expect(reserve).toBeEnabled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(STUDENT_ID);

    fireEvent.click(reserve);
    await waitFor(() => expect(api.createHold).toHaveBeenCalledWith(CLASS_ID, STUDENT_ID));
    expect(await screen.findByRole('status')).toHaveTextContent(/seat reserved/i);
  });

  it('shows only administration actions in the admin portal', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /open admin portal/i }));
    expect(await screen.findByRole('heading', { name: 'Create a new class' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/birth registration number/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reserve a seat/i })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: sampleClass.name })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Class / shift name'), {
      target: { value: 'Class 8 - Day Shift' },
    });
    fireEvent.change(screen.getByLabelText('Total seat capacity'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create class/i }));

    await waitFor(() => expect(api.createClass).toHaveBeenCalledWith('Class 8 - Day Shift', 12));
    expect(await screen.findByRole('status')).toHaveTextContent('Class created successfully.');
  });

  it('recovers the saved student ID and applications after reopening the page', async () => {
    localStorage.setItem(STORAGE_KEY, STUDENT_ID);
    window.history.replaceState({}, '', '/student');
    vi.mocked(api.getMyHolds).mockResolvedValue([makeHold()]);

    render(<App />);
    expect(screen.getByLabelText(/birth registration number/i)).toHaveValue(STUDENT_ID);
    expect(await screen.findByText('Time remaining:', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pay & confirm/i })).toBeEnabled();
    await waitFor(() => expect(api.getMyHolds).toHaveBeenCalledWith(STUDENT_ID));
  });

  it('allows confirmation and removes payment controls once confirmed', async () => {
    localStorage.setItem(STORAGE_KEY, STUDENT_ID);
    window.history.replaceState({}, '', '/student');
    vi.mocked(api.getMyHolds)
      .mockResolvedValueOnce([makeHold()])
      .mockResolvedValue([makeHold({ status: 'CONFIRMED' })]);

    render(<App />);
    const confirm = await screen.findByRole('button', { name: /pay & confirm/i });
    fireEvent.click(confirm);

    await waitFor(() => expect(api.confirmHold).toHaveBeenCalledWith(HOLD_ID, STUDENT_ID));
    expect(await screen.findByText('Admission confirmed successfully.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay & confirm/i })).not.toBeInTheDocument();
  });

  it('allows cancellation and removes reservation actions once cancelled', async () => {
    localStorage.setItem(STORAGE_KEY, STUDENT_ID);
    window.history.replaceState({}, '', '/student');
    vi.mocked(api.getMyHolds)
      .mockResolvedValueOnce([makeHold()])
      .mockResolvedValue([makeHold({ status: 'CANCELLED' })]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel hold' }));

    await waitFor(() => expect(api.cancelHold).toHaveBeenCalledWith(HOLD_ID, STUDENT_ID));
    expect(await screen.findByText('This application was cancelled.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel hold' })).not.toBeInTheDocument();
  });

  it('shows overdue HELD applications as expired and disables payment', async () => {
    localStorage.setItem(STORAGE_KEY, STUDENT_ID);
    window.history.replaceState({}, '', '/student');
    vi.mocked(api.getMyHolds).mockResolvedValue([
      makeHold({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    ]);

    render(<App />);
    expect(await screen.findByText('This reservation expired and its seat was released.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay & confirm/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel hold' })).not.toBeInTheDocument();
  });

  it('shows a visible error if the backend cannot be reached', async () => {
    window.history.replaceState({}, '', '/admin');
    vi.mocked(api.getClasses).mockRejectedValue(new Error('Network unavailable'));

    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection problem: Network unavailable');
  });
});
