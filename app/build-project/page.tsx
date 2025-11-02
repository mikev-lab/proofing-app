'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { onAuthStateChanged, getAuth } from 'firebase/auth';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { ref, getDownloadURL, getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Initialize Firebase services
const auth = getAuth();
const db = getFirestore();
const storage = getStorage();
const functions = getFunctions();
const generateFinalPdf = httpsCallable(functions, 'generateFinalPdf');


// Dynamically import the ProjectFileUploader to prevent SSR issues with dnd-kit
const ProjectFileUploader = dynamic(() => import('../components/ProjectFileUploader'), { ssr: false });


// Define the structure of a page object
interface Page {
  id: string;
  tempPreviewPath: string;
  tempSourcePath: string;
  originalName: string;
}

const BuildProjectPage = () => {
  const router = useRouter();
  const [pages, setPages] = useState<Page[]>([]);
  const [jobDetails, setJobDetails] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login Wall Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login?redirect=/build-project');
      } else {
        setIsAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Job Details Effect
  useEffect(() => {
    try {
      const details = sessionStorage.getItem('jobDetails');
      if (details) {
        setJobDetails(JSON.parse(details));
      } else {
        console.warn('Job details not found in session storage.');
        setError('Could not find your project details. Please create a new quote.');
      }
    } catch (e) {
      console.error('Failed to parse job details from session storage:', e);
      setError('There was an error loading your project details.');
    }
  }, []);

  const handleConfirmProject = async () => {
    if (!auth.currentUser || pages.length === 0 || !jobDetails) {
      setError('Cannot create project. Please ensure you have uploaded files and have valid job details.');
      return;
    }

    setIsCreatingProject(true);
    setError(null);

    try {
      // 1. Create the project document to get an ID
      const newProjectRef = await addDoc(collection(db, "projects"), {
        ...jobDetails,
        status: 'Pending Approval', // Initial status
        createdAt: serverTimestamp(),
        versions: [], // Start with empty versions
        userId: auth.currentUser.uid,
      });
      const projectId = newProjectRef.id;

      // 2. Prepare paths and call generateFinalPdf
      const orderedTempSourcePaths = pages.map(p => p.tempSourcePath);
      const result = await generateFinalPdf({ projectId, orderedTempSourcePaths });
      const { finalPdfPath } = (result.data as any);

      if (!finalPdfPath) {
        throw new Error('Final PDF path was not returned from the function.');
      }

      // 3. Get the download URL for the final PDF
      const finalPdfRef = ref(storage, finalPdfPath);
      const downloadURL = await getDownloadURL(finalPdfRef);

      // 4. Update the project document with the first version
      const firstVersion = {
        fileName: 'Generated Proof.pdf',
        fileURL: downloadURL,
        filePath: finalPdfPath,
        createdAt: serverTimestamp(),
        versionNumber: 1,
        processingStatus: 'processing'
      };
      await updateDoc(newProjectRef, { versions: [firstVersion] });

      // 5. Redirect based on user role
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.data();

      sessionStorage.removeItem('jobDetails');

      if (userData?.role === 'admin' || userData?.companyId) {
        router.push('/legacy-portal/dashboard.html?projectCreated=true');
      } else {
        router.push(`/checkout?projectId=${projectId}`);
      }

    } catch (err: any)      console.error("Error creating project:", err);
      setError(`Project creation failed: ${err.message}`);
      setIsCreatingProject(false);
    }
  };

  if (isAuthLoading) {
    return <div>Authenticating...</div>;
  }

  return (
    <div>
      <h1>Build Your Project</h1>
      {jobDetails && (
        <div>
          <h2>Project Summary</h2>
          <p>Product: {jobDetails.productName}</p>
          <p>Quantity: {jobDetails.quantity}</p>
        </div>
      )}
      <ProjectFileUploader pages={pages} setPages={setPages} />

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button
        onClick={handleConfirmProject}
        disabled={isCreatingProject || pages.length === 0 || !jobDetails}
      >
        {isCreatingProject ? 'Creating your project...' : 'Confirm & Checkout'}
      </button>
    </div>
  );
};

export default BuildProjectPage;
