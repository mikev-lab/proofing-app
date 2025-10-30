# Use an official Node.js runtime as a parent image (Choose your desired version, e.g., 20)
# We are using node:20-slim as the base for small size and efficiency.
FROM node:20-slim

# Set the working directory in the container
WORKDIR /workspace

# Install system dependencies:
# 1. ghostscript: For PDF optimization and generating thumbnails in storePageAsPdf.
# 2. qpdf: CRITICAL FIX for reliable local PDF merging and splitting (avoids Gotenberg crashes).
# 3. poppler-utils (includes pdfinfo): For preflight checks.
# 4. libimage-exiftool-perl: For metadata operations.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    qpdf \
    poppler-utils \
    libimage-exiftool-perl \
    # Clean up APT cache to reduce image size
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install app dependencies
RUN npm install \
    # Install production dependencies
    && npm install --only=production \
    # Install Functions Framework for running the Cloud Function via the custom container
    && npm install @google-cloud/functions-framework

# Copy the rest of your function's source code
COPY . .

# Define the command to run your function (using Functions Framework)
# We set the entry point to 'generatePreviews' here, but the deployment commands (Step 3) 
# will specify the correct target for each function (optimizePdf, generateFinalPdf, etc.).
CMD ["functions-framework", "--target=generatePreviews"]
