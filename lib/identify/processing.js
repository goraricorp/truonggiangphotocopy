export function createProcessor() {
  let worker,
    active,
    warming,
    sequence = 0,
    tail = Promise.resolve(),
    disposed = false
  const execute = (file, options, signal) =>
    new Promise((resolve, reject) => {
      if (disposed || signal?.aborted)
        return reject(new DOMException("Đã hủy xử lý.", "AbortError"))
      worker ??= new Worker(
        new URL("../../workers/identify.worker.js", import.meta.url),
        { type: "module" }
      )
      const id = ++sequence
      const cleanup = () => {
        signal?.removeEventListener("abort", abort)
        active = null
      }
      const fail = (error) => {
        cleanup()
        reject(error)
      }
      const abort = () => {
        worker?.terminate()
        worker = null
        fail(new DOMException("Đã hủy xử lý.", "AbortError"))
      }
      active = abort
      signal?.addEventListener("abort", abort, { once: true })
      worker.onmessage = ({ data }) => {
        if (data.id !== id) return
        cleanup()
        if (data.error) reject(new Error(data.error))
        else resolve(data.result)
      }
      worker.onerror = () => {
        worker?.terminate()
        worker = null
        fail(
          new Error(
            "Không tải được bộ xử lý ảnh. Vui lòng thử lại bằng trình duyệt mới."
          )
        )
      }
      worker.postMessage({ id, file, ...options })
    })
  return {
    warmup() {
      if (!warming) {
        const job = tail.then(() => execute(undefined, { type: "warmup" }))
        tail = job.catch(() => {})
        warming = job.catch((error) => {
          warming = null
          throw error
        })
      }
      return warming
    },
    process(file, options = {}, signal) {
      const job = tail.then(() => execute(file, options, signal))
      tail = job.catch(() => {})
      return job
    },
    dispose() {
      disposed = true
      active?.()
      worker?.terminate()
      worker = null
    },
  }
}
