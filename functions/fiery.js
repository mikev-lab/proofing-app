const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

// --- Mock Fiery Service ---
// Simulates interaction with a Fiery Print Server API

const mockJobs = new Map(); // Store simulated job states in memory (reset on restart)

// --- Internal Logic (Exported for Server-Side Use) ---
const mockFieryLogic = {
    login: () => ({
        success: true,
        data: { authenticated: true, accessrights: "yes", session_key: "mock_session_key_12345" }
    }),

    submitJob: (payload, authEmail) => {
        const jobId = `fiery_job_${Date.now()}`;
        mockJobs.set(jobId, {
            id: jobId,
            projectId: payload.projectId,
            status: 'spooled',
            title: payload.projectName || 'Untitled Job',
            username: authEmail || 'admin',
            num_pages: payload.numPages || -1,
            submittedAt: Date.now()
        });

        // Auto-start simulation
        setTimeout(() => {
            const job = mockJobs.get(jobId);
            if (job) job.status = 'printing';
        }, 5000);

        return { success: true, data: { id: jobId } };
    },

    startJob: (payload) => {
        const { jobId } = payload;
        // Also support passing projectId directly if that's what we have
        // But for consistency let's look for a job with that projectId if needed
        // For simplicity, just accept jobId or treat payload as ID if string

        let job;
        if (typeof payload === 'string') {
             // Try to find by ID first
             job = mockJobs.get(payload);
             // If not, maybe it's a projectId?
             if (!job) {
                 for (const j of mockJobs.values()) {
                     if (j.projectId === payload) { job = j; break; }
                 }
             }
        } else {
            job = mockJobs.get(jobId);
        }

        if (job) {
            job.status = 'printing';
            return { success: true, data: { method: true } };
        } else {
            return { success: true, data: { method: true, note: "Job started (Simulated)" } };
        }
    },

    getJobStatus: (payload) => {
        const { jobId } = payload;
        const job = mockJobs.get(jobId);
        if (job) {
            const elapsed = Date.now() - job.submittedAt;
            if (job.status === 'printing' && elapsed > 20000) job.status = 'printed';
            if (job.status === 'printing' && Math.random() < 0.05) {
                job.status = 'error';
                job.error_message = 'Paper Jam Tray 2';
            }
            return { success: true, data: { ...job } };
        }
        return { success: true, data: { id: jobId, status: 'unknown', note: "Mock memory cleared" } };
    },

    getConsumables: () => ({
        success: true,
        data: {
            colorants: [
                { name: 'Cyan', level: 85 },
                { name: 'Magenta', level: 42 },
                { name: 'Yellow', level: 12 },
                { name: 'Black', level: 90 }
            ],
            trays: [
                { name: 'Tray 1', status: 'OK', paper: 'Letter Plain' },
                { name: 'Tray 2', status: 'Empty', paper: '12x18 Gloss' },
                { name: 'Tray 3', status: 'OK', paper: '11x17 Matte' }
            ]
        }
    })
};

exports.mockFieryLogic = mockFieryLogic;

exports.mockFieryAPI = onCall({ region: 'us-central1' }, async (request) => {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'You must be authenticated to use the Fiery API.');
    }

    const { action, payload } = request.data;
    logger.info(`Mock Fiery API called. Action: ${action}`, payload);

    if (action === 'login') return mockFieryLogic.login();
    if (action === 'submitJob') return mockFieryLogic.submitJob(payload, request.auth.token.email);
    if (action === 'startJob') return mockFieryLogic.startJob(payload);
    if (action === 'getJobStatus') return mockFieryLogic.getJobStatus(payload);
    if (action === 'getConsumables') return mockFieryLogic.getConsumables();

    throw new HttpsError('invalid-argument', `Unknown action: ${action}`);
});
