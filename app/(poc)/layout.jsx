import Navbar from "./components/Navbar";

// Shared shell for all POC pages: aurora dark background + sticky navbar.
export default function PocLayout({ children }) {
  return (
    <div className="app-shell flex flex-1 flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
