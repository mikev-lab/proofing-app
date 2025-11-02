import Link from 'next/link';

const Footer = () => {
  return (
    <footer className="bg-gray-800 text-white">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">Books & Booklets</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/products/perfect-bound-books" className="text-base text-gray-300 hover:text-white">
                  Perfect Bound Books
                </Link>
              </li>
              <li>
                <Link href="/products/saddle-stitch-booklets" className="text-base text-gray-300 hover:text-white">
                  Saddle Stitch Booklets
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">Specialty</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/products/manga-printing" className="text-base text-gray-300 hover:text-white">
                  Manga Printing
                </Link>
              </li>
              <li>
                <Link href="/products/doujinshi-printing" className="text-base text-gray-300 hover:text-white">
                  Doujinshi Printing
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">Marketing</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/products/flyers" className="text-base text-gray-300 hover:text-white">
                  Flyers
                </Link>
              </li>
              <li>
                <Link href="/products/business-cards" className="text-base text-gray-300 hover:text-white">
                  Business Cards
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">Company</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/about" className="text-base text-gray-300 hover:text-white">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-base text-gray-300 hover:text-white">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-700 pt-8 text-center text-base text-gray-400">
          &copy; {new Date().getFullYear()} MCE Printing. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
