import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  const productCategories = [
    { name: 'Perfect Bound Books', href: '/products/perfect-bound-books', imageUrl: 'https://picsum.photos/400/300?random=1' },
    { name: 'Saddle Stitch Booklets', href: '/products/saddle-stitch-booklets', imageUrl: 'https://picsum.photos/400/300?random=2' },
    { name: 'Manga', href: '/products/manga', imageUrl: 'https://picsum.photos/400/300?random=3' },
    { name: 'Flyers', href: '/products/flyers', imageUrl: 'https://picsum.photos/400/300?random=4' },
    { name: 'Business Cards', href: '/products/business-cards', imageUrl: 'https://picsum.photos/400/300?random=5' },
    { name: 'Posters', href: '/products/posters', imageUrl: 'https://picsum.photos/400/300?random=6' },
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gray-100 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            High-Quality Book, Manga, & Doujinshi Printing
          </h1>
          <p className="mt-3 max-w-md mx-auto text-lg text-gray-500 sm:text-xl md:mt-5 md:max-w-3xl">
            From art books and manga to professional booklets, get an instant quote on your next project. Based right here in Kirkland, WA.
          </p>
          <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
            <div className="rounded-md shadow">
              <Link href="/quote" className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10">
                Get an Instant Quote
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-800">Doujinshi/Manga Specialty</h3>
              <p className="mt-2 text-gray-600">We specialize in high-quality printing for artists and creators.</p>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-800">Located in Kirkland, WA</h3>
              <p className="mt-2 text-gray-600">Proudly serving the local community and beyond.</p>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-800">Professional Equipment</h3>
              <p className="mt-2 text-gray-600">State-of-the-art technology for stunning results.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Product Categories Section */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-gray-900 text-center">Product Categories</h2>
          <div className="mt-12 grid gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {productCategories.map((product) => (
              <Link key={product.name} href={product.href} className="block group">
                <div className="w-full aspect-w-1 aspect-h-1 bg-gray-200 rounded-lg overflow-hidden xl:aspect-w-7 xl:aspect-h-8">
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    width={400}
                    height={300}
                    className="w-full h-full object-center object-cover group-hover:opacity-75"
                  />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-700">{product.name}</h3>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
