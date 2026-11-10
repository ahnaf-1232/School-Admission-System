const API_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080")
    .replace(/\/$/, "");

export type HoldStatus = "HELD" | "CONFIRMED" | "EXPIRED" | "CANCELLED";

export type AdmissionClass = {
    id: string;
    name: string;
    totalSeats: number;
    heldSeats: number;
    confirmedSeats: number;
    availableSeats: number;
};

export type MyHold = {
    holdId: string;
    classId: string;
    className: string;
    status: HoldStatus;
    expiresAt: string;
};

export type HoldDetails = {
    holdId: string;
    classId: string;
    status: HoldStatus;
    expiresAt: string;
};

async function request<T>(
    path: string,
    options: RequestInit = {},
    studentId?: string
): Promise<T> {
    const headers = new Headers(options.headers);
    if (studentId) headers.set("X-Student-Id", studentId);
    if (options.body) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
        response = await fetch(`${API_URL}${path}`, { ...options, headers });
    } catch {
        throw new Error("Cannot connect to the server. Is the .NET API running on port 8080?");
    }

    if (!response.ok) {
        let message = `The request failed (HTTP ${response.status}).`;
        try {
            const problem = await response.json();
            if (typeof problem.message === "string") {
                message = problem.message;
            } else if (problem.errors) {
                message = Object.values(problem.errors).flat().join(" ");
            } else if (typeof problem.title === "string") {
                message = problem.title;
            }
        } catch { /* Response was not JSON. */ }
        throw new Error(message);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
}

export const api = {
    getClasses: () => request<AdmissionClass[]>("/classes"),
    createClass: (name: string, totalSeats: number) =>
        request<{ id: string }>("/classes", {
            method: "POST",
            body: JSON.stringify({ name, totalSeats })
        }),
    createHold: (classId: string, studentId: string) =>
        request<{ holdId: string }>(`/classes/${classId}/holds`, { method: "POST" }, studentId),
    getHold: (holdId: string) => request<HoldDetails>(`/holds/${holdId}`),
    getMyHolds: (studentId: string) => request<MyHold[]>("/me/holds", {}, studentId),
    confirmHold: (holdId: string, studentId: string) =>
        request<{ holdId: string; status: HoldStatus }>(
            `/holds/${holdId}/confirm`, { method: "POST" }, studentId
        ),
    cancelHold: (holdId: string, studentId: string) =>
        request<void>(`/holds/${holdId}`, { method: "DELETE" }, studentId)
};
