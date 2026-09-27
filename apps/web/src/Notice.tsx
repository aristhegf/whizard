import { navigate } from "./router";
import { Brand } from "./ui/Chrome";

export function Notice({ message }: { message: string }) {
  return (
    <div className="page">
      <header className="topnav">
        <Brand />
      </header>
      <div className="notice">
        <img src="/art/mascot/podium.webp" alt="" width={590} height={620} />
        <p role="alert">{message}</p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>
          Back to home
        </button>
      </div>
    </div>
  );
}
