import { useEffect, useRef, useState } from "react";
import { uploadRoomPhoto } from "../../api";
import { loadSession } from "../../storage";
import { useToast } from "../../ui/toast";
import { clearPendingPhoto, PhotoCropper, pendingPhoto } from "./PhotoCropper";

/**
 * The host's own photo for a jigsaw: `pick()` opens the file picker, then the cropper, then sends
 * the square to the room. Put `element` anywhere in the lobby.
 */
export function useJigsawPhoto(code: string, isHost: boolean) {
  const input = useRef<HTMLInputElement>(null);
  // A photo chosen on the Jigsaw page before the room opened goes straight to the cropper.
  const [file, setFile] = useState<File | null>(() => (isHost ? pendingPhoto() : null));
  const toast = useToast();
  useEffect(() => {
    if (isHost) clearPendingPhoto();
  }, [isHost]);

  const use = async (photo: Blob) => {
    const token = loadSession(code)?.sessionToken;
    if (!token) throw new Error("Join the room first.");
    await uploadRoomPhoto(code, token, photo);
    setFile(null);
    toast.show({ title: "Your photo is the jigsaw.", status: "success" });
  };

  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (chosen) setFile(chosen);
        }}
      />
      {file && <PhotoCropper file={file} onUse={use} onCancel={() => setFile(null)} />}
    </>
  );

  return { pick: () => input.current?.click(), element };
}
