# Use an official Node.js runtime as a parent image (Choose your desired version, e.g., 20)
# Make sure this matches the runtime you intend to use for Cloud Functions (Gen 2)
FROM node:20-slim

# Set the working directory in the container
WORKDIR /workspace

# Install system dependencies: Ghostscript
# RUN apt-get update && apt-get install -y --no-install-recommends ghostscript
# Update: Use the fullchain image provided by Google, which has build tools
# We need this step to ensure the underlying OS has package lists updated and installs gs
RUN apt-get update && apt-get install -y --no-install-recommends ghostscript && \
    # Clean up apt cache to reduce image size
    rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install app dependencies using the Functions Framework package manager helper
# This ensures dependencies required by the framework are also installed.
# RUN npm install --only=production
# Update: Use the Functions Framework helper for cleaner installs in Cloud Functions
RUN npm install \
 && npm install --only=production \
 && npm install @google-cloud/functions-framework

# Copy the rest of your function's source code
COPY . .

# Define the command to run your function (using Functions Framework)
# The target 'optimizePdf' must match the exported function name in index.js
CMD ["functions-framework", "--target=optimizePdf"]