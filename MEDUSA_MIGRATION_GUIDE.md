# Medusa Migration Guide

Use this guide to populate your Medusa store with the existing product catalog.

## General Instructions
1.  **Product Type:** Used to map to the correct builder in the future (e.g. `book_builder`, `print_builder`).
2.  **Metadata:** Add a key named `features` with a JSON string or comma-separated list of features.
3.  **Categories:** Assign products to categories to organize the store.
4.  **Collections:** Use Collections for "Popular at [Event]" tags.

---

## Products

### 1. Perfect Bound Books
*   **Title:** Perfect Bound Books
*   **Handle:** `perfect-bound-books`
*   **Type:** `book_builder`
*   **Categories:** `Books`
*   **Description:** Our perfect bound books offer a sleek, professional finish that artists and authors love. Using a strong, flexible glue, we bind the pages to a wrap-around cover, creating a durable square spine that looks great on any bookshelf. Perfect for projects with 28 to 400+ pages.
*   **Features (Metadata):** `["28 to 400+ pages", "Square printable spine", "Gloss or Matte cover finish"]`
*   **Specs (Options):** Size (5.5x8.5, 6x9, A5, A4, 8.5x11), Paper Stock (80lb Gloss, 70lb Uncoated, 100lb Gloss)

### 2. Saddle Stitch Booklets
*   **Title:** Saddle Stitch Booklets
*   **Handle:** `saddle-stitch-booklets`
*   **Type:** `book_builder`
*   **Categories:** `Books`
*   **Description:** Saddle stitching is the go-to binding method for comics, zines, and shorter booklets. Sheets are folded and stapled through the fold line, allowing the book to lay fully flat. It’s economical, fast, and perfect for lower page counts.
*   **Features (Metadata):** `["8 to 60 pages", "Lays flat when open", "Fast production time"]`
*   **Specs (Options):** Size (5.5x8.5, 6x9, A5, A4, Comic Standard)

### 3. Hardcover Books
*   **Title:** Hardcover Books
*   **Handle:** `hardcover-books`
*   **Type:** `book_builder`
*   **Categories:** `Books`
*   **Description:** Make a statement with our premium hardcover books. Featuring a printed case wrap or dust jacket options, these books are built to last and impress.
*   **Features (Metadata):** `["Case Bound", "Dust Jacket Option", "Smyth Sewn available"]`

### 4. Spiral / Coil Bound
*   **Title:** Spiral / Coil Bound
*   **Handle:** `spiral-bound-books`
*   **Type:** `book_builder`
*   **Categories:** `Books`
*   **Description:** Coil binding allows pages to rotate 360 degrees and lay completely flat. Ideal for workbooks, sketchbooks, and reference guides.
*   **Features (Metadata):** `["Lays 360° flat", "Durable coil", "Great for writing"]`

### 5. Manga Printing
*   **Title:** Manga Printing
*   **Handle:** `manga`
*   **Type:** `book_builder`
*   **Categories:** `Books`
*   **Description:** We specialize in printing manga the way it was meant to be read. Choose from standard trade sizes, authentic cream-colored uncoated paper stocks, and even right-to-left binding configuration.
*   **Features (Metadata):** `["Right-to-Left Binding", "Cream Paper Stock", "Standard Manga Sizes"]`

### 6. Premium Art Prints
*   **Title:** Premium Art Prints
*   **Handle:** `art-prints`
*   **Type:** `print_builder`
*   **Categories:** `Prints`
*   **Description:** Capture every detail of your artwork with our premium cardstock prints. We use high-grade coated stocks that make colors pop and blacks deep.
*   **Features (Metadata):** `["100lb or 12pt Cardstock", "Vibrant color reproduction", "Gloss, Matte, or Satin"]`

### 7. Holographic Prints
*   **Title:** Holographic Prints
*   **Handle:** `holographic-prints`
*   **Type:** `print_builder`
*   **Categories:** `Prints`
*   **Description:** Stand out with holographic cardstock that reflects light in a rainbow spectrum. Perfect for special edition prints.
*   **Features (Metadata):** `["Rainbow/Shattered Glass", "Heavy Cardstock", "Eye-catching"]`

### 8. Large Format Posters
*   **Title:** Large Format Posters
*   **Handle:** `large-format-posters`
*   **Type:** `large_format_builder`
*   **Categories:** `Large Format`
*   **Description:** Go big with our large format posters. Printed on high-quality semi-gloss or matte paper.
*   **Features (Metadata):** `["11x17 to 24x36", "Rolled shipping", "Vibrant ink"]`

### 9. Vinyl Banners
*   **Title:** Vinyl Banners
*   **Handle:** `vinyl-banners`
*   **Type:** `large_format_builder`
*   **Categories:** `Large Format`
*   **Description:** Essential for your table setup. Our vinyl banners are durable, easy to hang, and come with grommets.
*   **Features (Metadata):** `["Indoor/Outdoor Vinyl", "Grommets included", "Custom Sizes"]`

### 10. Retractable Banner Stands
*   **Title:** Retractable Banner Stands
*   **Handle:** `retractable-banners`
*   **Type:** `large_format_builder`
*   **Categories:** `Large Format`
*   **Description:** The ultimate professional display. Sets up in seconds and rolls down into a compact carrying case.
*   **Features (Metadata):** `["Includes Stand & Case", "33x81 inch standard", "Premium Non-Curl"]`

### 11. Business Cards
*   **Title:** Business Cards
*   **Handle:** `business-cards`
*   **Type:** `print_builder`
*   **Categories:** `Marketing`
*   **Description:** Don't leave a connection behind. High quality business cards on 14pt or 16pt stock.
*   **Features (Metadata):** `["14pt or 16pt Stock", "Matte, Gloss, or Soft Touch", "Spot UV available"]`

### 12. Postcards / Flyers
*   **Title:** Postcards / Flyers
*   **Handle:** `postcards-flyers`
*   **Type:** `print_builder`
*   **Categories:** `Marketing`
*   **Description:** Versatile marketing tools. Use them as commission sheets, mini-prints, or promotional handouts.
*   **Features (Metadata):** `["4x6, 5x7, or Custom", "Bulk Pricing", "Fast Turnaround"]`

### 13. Bookmarks
*   **Title:** Bookmarks
*   **Handle:** `bookmarks`
*   **Type:** `print_builder`
*   **Categories:** `Marketing`
*   **Description:** A classic merch item for authors and artists. Double-sided printing available.
*   **Features (Metadata):** `["2x6 or 2x7 inch", "Hole punch option", "Tassel option"]`

### 14. Die-Cut Stickers
*   **Title:** Die-Cut Stickers
*   **Handle:** `die-cut-stickers`
*   **Type:** `merch_builder`
*   **Categories:** `Merch`
*   **Description:** High quality vinyl stickers that are water and scratch resistant. Cut to any shape.
*   **Features (Metadata):** `["Waterproof Vinyl", "Custom Shapes", "Matte or Gloss"]`

### 15. Sticker Sheets
*   **Title:** Sticker Sheets
*   **Handle:** `sticker-sheets`
*   **Type:** `merch_builder`
*   **Categories:** `Merch`
*   **Description:** Great for sets and collections. Kiss-cut stickers on a 4x6 or 5x7 sheet.
*   **Features (Metadata):** `["Kiss-Cut", "Branding Header", "Retail Ready"]`

### 16. Acrylic Charms
*   **Title:** Acrylic Charms
*   **Handle:** `acrylic-charms`
*   **Type:** `merch_builder`
*   **Categories:** `Merch`
*   **Description:** Vibrant custom shaped keychains. Double board acrylic with epoxy dome options.
*   **Features (Metadata):** `["Clear Acrylic", "Double Sided", "Keyring included"]`

### 17. Pinback Buttons
*   **Title:** Pinback Buttons
*   **Handle:** `buttons`
*   **Type:** `merch_builder`
*   **Categories:** `Merch`
*   **Description:** An affordable staple for any table. Steel pin-back buttons with vibrant printing.
*   **Features (Metadata):** `["1.25\" or 2.25\"", "Steel construction", "Gloss finish"]`
