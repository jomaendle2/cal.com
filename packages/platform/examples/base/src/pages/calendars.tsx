import { Navbar } from "@/components/navbar";
import { Inter, Poppins } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "800"] });

export default function Calendars() {
  return (
    <main className={`flex min-h-screen flex-col ${inter.className}`}>
      <Navbar />
      <div>
        <h1>This is the google calendar page</h1>
      </div>
    </main>
  );
}