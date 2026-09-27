import { navigate } from "./router";

export function Notice({ message }: { message: string }) {
  return (
    <div className="screen notice">
      <p role="alert">{message}</p>
      <button className="btn btn-primary" onClick={() => navigate("/")}>
        Back to home
      </button>
    </div>
  );
}
