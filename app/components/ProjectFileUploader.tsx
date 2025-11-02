'use client';

import React, { useState, useCallback } from 'react';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import PdfThumbnail from './PdfThumbnail';

// Initialize Cloud Functions
const functions = getFunctions();
const generatePreviews = httpsCallable(functions, 'generatePreviews');


// Define the structure of a page object
interface Page {
  id: string; // Unique ID for dnd-kit, now using tempSourcePath
  tempPreviewPath: string;
  tempSourcePath: string;
  originalName: string;
  // Add other properties from the generatePreviews function as needed
}

// Props for the uploader component
interface ProjectFileUploaderProps {
  pages: Page[];
  setPages: React.Dispatch<React.SetStateAction<Page[]>>;
}

// Internal component for a single sortable thumbnail
const SortableThumbnail: React.FC<{ page: Page }> = ({ page }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    margin: '10px',
    padding: '5px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    background: '#fff',
    display: 'inline-block',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PdfThumbnail tempPreviewPath={page.tempPreviewPath} />
      <p style={{ textAlign: 'center', margin: '5px 0 0', fontSize: '12px' }}>{page.originalName}</p>
    </div>
  );
};


const ProjectFileUploader: React.FC<ProjectFileUploaderProps> = ({ pages, setPages }) => {
  const [uploadStatus, setUploadStatus] = useState<Record<string, { status: string; error?: string }>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      console.error("User is not authenticated.");
      // This should ideally be handled by the parent page's login wall
      return;
    }

    const newUploadStatus = { ...uploadStatus };

    const fileList = Array.from(files);
    fileList.forEach(file => {
      newUploadStatus[file.name] = { status: 'Uploading...' };
    });
    setUploadStatus(newUploadStatus);

    await Promise.all(
      fileList.map(async (file) => {
        try {
          const storage = getStorage();
          const tempId = user.uid;
          const uploadPath = `temp_uploads/${tempId}/${Date.now()}_${file.name}`;
          const storageRef = ref(storage, uploadPath);

          await uploadBytes(storageRef, file);

          setUploadStatus(prev => ({ ...prev, [file.name]: { status: 'Processing...' } }));

          const result = await generatePreviews({ uploadPath, originalName: file.name });
          const newPagesData = (result.data as any).pages;

          // Use the stable tempSourcePath as the unique ID for dnd-kit
          const newPagesWithIds = newPagesData.map((p: any) => ({ ...p, id: p.tempSourcePath }));

          setPages(prevPages => [...prevPages, ...newPagesWithIds]);
          setUploadStatus(prev => ({ ...prev, [file.name]: { status: 'Complete' } }));

        } catch (err: any) {
          console.error(`Failed to process file ${file.name}:`, err);
          setUploadStatus(prev => ({ ...prev, [file.name]: { status: 'Error', error: err.message || 'An unknown error occurred' } }));
        }
      })
    );
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <div>
      <h3>Upload Your Project Files</h3>
      <p>You can upload multiple files at once (PDF, JPG, PNG, etc.). Drag and drop the thumbnails to set the page order.</p>

      <input
        type="file"
        multiple
        onChange={handleFileChange}
        style={{ margin: '20px 0' }}
      />

      <div>
        {Object.entries(uploadStatus).map(([name, { status, error }]) => (
          <div key={name}>
            <span>{name}: {status}</span>
            {error && <span style={{ color: 'red' }}> - {error}</span>}
          </div>
        ))}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pages.map(p => p.id)} strategy={horizontalListSortingStrategy}>
          <div style={{ marginTop: '20px' }}>
            {pages.map(page => (
              <SortableThumbnail key={page.id} page={page} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default ProjectFileUploader;
