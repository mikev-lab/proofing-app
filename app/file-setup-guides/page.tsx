import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'File Setup Guides - MCE Printing',
  description: 'Learn how to properly set up your files for printing with our guides on bleed, resolution, and color profiles.',
};

export default function FileSetupGuidesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">File Setup Guides</h1>
      <p className="mb-4">
        Proper file setup is crucial for achieving the best printing results. Here you'll find guides to help you prepare your files correctly.
      </p>

      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Bleed</h2>
          <p>Coming soon...</p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Resolution</h2>
          <p>Coming soon...</p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Color Profiles</h2>
          <p>Coming soon...</p>
        </div>
      </div>
    </div>
  );
}
