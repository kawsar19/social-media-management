import Navbar from "./components/Navbar";

// Shared layout for all POC pages (/connect, /post). Renders the navbar
// above the page content.
export default function PocLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      {children}
    </div>
  );
}
