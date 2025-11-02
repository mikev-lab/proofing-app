import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Our Equipment - MCE Printing',
  description: 'A list of the high-quality printing and binding equipment we use at MCE Printing to produce beautiful books.',
};

export default function OurEquipmentPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Our Equipment</h1>
      <p className="mb-6">We invest in high-quality equipment to ensure your projects are printed and finished to the highest standard.</p>

      <ul className="list-disc list-inside space-y-2">
        <li>Konica Minolta C3080</li>
        <li>BQ-270 Perfect Binder</li>
        <li>Saddle Stitcher</li>
        <li>Epson P6000</li>
        <li>Gloss and Matte Laminator</li>
      </ul>
    </div>
  );
}
