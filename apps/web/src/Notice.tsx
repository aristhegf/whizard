import { navigate } from "./router";
import { Brand } from "./ui/Chrome";

export function Notice({ message }: { message: string }) {
  return (
    <div className="page">
      <header className="topnav">
        <Brand />
      </header>
      <div className="notice">
        <img src="/art/mascot/wave.webp" alt="" width={180} height={208} />
        <p role="alert">{message}</p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>
          Back to home
        </button>
      </div>
    </div>
  );
}
