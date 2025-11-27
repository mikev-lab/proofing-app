const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

// --- Mock Fiery Service ---
// Simulates interaction with a Fiery Print Server API

const mockJobs = new Map(); // Store simulated job states in memory (reset on restart)

exports.mockFieryAPI = onCall({ region: 'us-central1' }, async (request) => {
    // 1. Authentication Check
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'You must be authenticated to use the Fiery API.');
    }

    const { action, payload } = request.data;

    logger.info(`Mock Fiery API called. Action: ${action}`, payload);

    if (action === 'login') {
        // Simulates /live/api/v5/login
        // Always succeeds for mock purposes
        return {
            success: true,
            data: {
                authenticated: true,
                accessrights: "yes",
                session_key: "mock_session_key_12345"
            }
        };
    }

    if (action === 'submitJob') {
        // Simulates POST /live/api/v5/jobs
        // Payload: { projectId, filePath, quantity, ... }
        const jobId = `fiery_job_${Date.now()}`;

        mockJobs.set(jobId, {
            id: jobId,
            projectId: payload.projectId,
            status: 'spooled', // Initial status
            title: payload.projectName || 'Untitled Job',
            username: request.auth.token.email || 'admin',
            num_pages: payload.numPages || -1,
            submittedAt: Date.now()
        });

        // Simulate a transition to 'printing' after a delay
        setTimeout(() => {
            const job = mockJobs.get(jobId);
            if (job) job.status = 'printing';
        }, 5000);

        return {
            success: true,
            data: { id: jobId }
        };
    }

    if (action === 'startJob') {
        // Simulates PUT /live/api/v5/jobs/:id/print
        const { jobId } = payload;
        const job = mockJobs.get(jobId);

        if (job) {
            job.status = 'printing';
            return { success: true, data: { method: true } };
        } else {
             // If not found in memory, just fake a success response for "mock" consistency
             return { success: true, data: { method: true, note: "Job not in memory mock, assumed started" } };
        }
    }

    if (action === 'getJobStatus') {
        // Simulates GET /live/api/v5/jobs/:id
        const { jobId } = payload;
        const job = mockJobs.get(jobId);

        if (job) {
            // Randomly simulate completion or error
            const elapsed = Date.now() - job.submittedAt;
            if (job.status === 'printing' && elapsed > 20000) { // Finish after 20s
                 job.status = 'printed';
            }
            // 5% chance of error
            if (job.status === 'printing' && Math.random() < 0.05) {
                job.status = 'error';
                job.error_message = 'Paper Jam Tray 2';
            }

            return {
                success: true,
                data: { ...job }
            };
        } else {
            // Return a default status if ID not found (e.g. server restart cleared memory)
            return {
                success: true,
                data: { id: jobId, status: 'unknown', note: "Mock memory cleared" }
            };
        }
    }

    throw new HttpsError('invalid-argument', `Unknown action: ${action}`);
});
