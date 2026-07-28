import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import { CartProvider } from "../../components/CartContext";
import { WishlistProvider } from "../../components/WishlistContext";

// This layout wraps ONLY the customer-facing storefront pages.
// /dashboard, /admin, and /(auth) have their own layouts and must NOT inherit this.
// Keeping providers here prevents useless /api/cart and /api/wishlist fetches
// from firing on every admin/dashboard navigation.

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <WishlistProvider>
        <Navbar />
        <main className="flex-1 pt-24 flex flex-col">
          {children}
        </main>
        <Footer />
      </WishlistProvider>
    </CartProvider>
  );
}
