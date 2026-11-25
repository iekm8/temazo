// Fetches Deezer preview URLs from the browser. Deezer blocks many cloud
// servers (403), but answers normal home/mobile connections. Its API has no
// CORS headers, so we use its JSONP mode (<script> + callback).

let seq = 0;

function jsonp(url: string, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const name = `__dz${Date.now()}_${seq++}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete (window as any)[name];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);
    (window as any)[name] = (data: unknown) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("network"));
    };
    script.src = `${url}${url.includes("?") ? "&" : "?"}output=jsonp&callback=${name}`;
    document.head.appendChild(script);
  });
}

export async function deezerPreviews(ids: number[]): Promise<(string | null)[]> {
  // Deezer allows ~50 requests / 5 s, so a game's worth in parallel is fine.
  return Promise.all(
    ids.map(async (id) => {
      try {
        const data = await jsonp(`https://api.deezer.com/track/${Number(id)}`);
        return typeof data?.preview === "string" && data.preview ? data.preview : null;
      } catch {
        return null;
      }
    }),
  );
}
