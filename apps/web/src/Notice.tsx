import { navigate } from "./router";

export function Notice({ message }: { message: string }) {
  return (
    <section className="card">
      <p className="notice" role="alert">
        {message}
      </p>
      <button className="primary" onClick={() => navigate("/")}>
        Back to home
      </button>
    </section>
  );
}
