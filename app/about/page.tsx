import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About MCE Printing',
  description: 'Learn about the history of MCE Printing, a Kirkland-based print shop specializing in high-quality doujinshi, manga, and comics.',
};

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">About MCE Printing</h1>
      <p className="mb-4">
        Founded in Kirkland, WA, MCE Printing has been a cornerstone of the local creative community for years. We are passionate about bringing stories to life through high-quality printing.
      </p>
      <p className="mb-4">
        Our specialty lies in producing beautiful doujinshi, manga, and comics. We understand the unique needs of artists and creators, and we are dedicated to providing a service that honors their work with exceptional quality and attention to detail. From vibrant colors to crisp line art, we ensure every page reflects the author's vision.
      </p>
      <p>
        We are proud to support independent creators and the vibrant world of self-published comics and art books.
      </p>
    </div>
  );
}
