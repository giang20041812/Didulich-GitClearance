import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Camera, CameraOff, Check, ImagePlus, Loader2, RefreshCw, RotateCcw, SwitchCamera, X } from 'lucide-react';

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  /** Ảnh JPEG vừa chụp (chưa nén — CheckinForm nén + kiểm tra như ảnh chọn từ thư viện). */
  onCapture: (file: File) => void;
  /** Không mở được camera: chọn ảnh có sẵn thay thế. */
  onPickLibrary: () => void;
  placeName?: string;
}

type CameraError = { title: string; body: string };

/** Lỗi getUserMedia → lời nhắn dễ hiểu. */
function cameraError(err: unknown): CameraError {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      title: 'Chưa có quyền dùng camera',
      body: 'Trình duyệt đang chặn camera cho trang này. Bấm biểu tượng ổ khóa cạnh thanh địa chỉ, cho phép Camera rồi bấm Thử lại — hoặc chọn ảnh có sẵn.',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return { title: 'Không tìm thấy camera', body: 'Thiết bị này không có camera hoặc camera đang bị tắt. Bạn có thể chọn ảnh có sẵn.' };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return { title: 'Camera đang bận', body: 'Một ứng dụng hoặc tab khác đang dùng camera. Đóng ứng dụng đó rồi bấm Thử lại.' };
  }
  return { title: 'Không mở được camera', body: 'Đã có lỗi khi mở camera. Bấm Thử lại hoặc chọn ảnh có sẵn.' };
}

/**
 * Camera ngay trong trang (máy tính có webcam): xem trước, nút chụp, chụp lại / dùng ảnh này, đổi camera nếu máy có
 * nhiều camera. Điện thoại không dùng khung này — CheckinForm mở thẳng ứng dụng camera của máy (input capture). Luôn tắt
 * camera khi chụp xong, khi đóng hoặc khi rời trang.
 */
export default function CameraCapture({ open, onClose, onCapture, onPickLibrary, placeName }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Mỗi lần mở camera một số mới — kết quả của lần mở cũ (đã đóng / đổi camera) bị bỏ. */
  const runRef = useRef(0);
  const [status, setStatus] = useState<'starting' | 'live' | 'shot' | 'error'>('starting');
  const [error, setError] = useState<CameraError | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(false);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [flash, setFlash] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async (wantedDevice?: string | null) => {
    const run = ++runRef.current;
    stopStream();
    setStatus('starting');
    setError(null);
    try {
      const video: MediaTrackConstraints = wantedDevice
        ? { deviceId: { exact: wantedDevice }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      if (run !== runRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const settings = stream.getVideoTracks()[0]?.getSettings();
      setDeviceId(settings?.deviceId ?? null);
      // Webcam trước mặt: lật ngang khung xem trước như soi gương (ảnh chụp vẫn đúng chiều thật).
      setMirrored(settings?.facingMode !== 'environment');
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      if (run !== runRef.current) return;
      setCameras(devices.filter((d) => d.kind === 'videoinput'));
      setStatus('live');
    } catch (err) {
      if (run !== runRef.current) return;
      setError(cameraError(err));
      setStatus('error');
    }
  }, [stopStream]);

  useEffect(() => {
    if (!open) return undefined;
    void start(null);
    return () => {
      runRef.current += 1;
      stopStream();
    };
  }, [open, start, stopStream]);

  // Ảnh chụp chưa dùng: thu hồi URL xem trước khi đổi ảnh / đóng.
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  // Dự phòng: khung video gắn vào trang sau khi camera đã mở.
  useEffect(() => {
    const video = videoRef.current;
    if (status !== 'live' || !video || !streamRef.current || video.srcObject === streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {});
  }, [status]);

  const close = () => {
    setShot(null);
    onClose();
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
    const run = runRef.current;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    // Khách đã đóng camera (Esc, X) trong lúc nén ảnh: bỏ ảnh, lần mở sau không hiện ảnh cũ đè lên khung xem trước.
    if (!blob || run !== runRef.current) return;
    const file = new File([blob], `check-in-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    runRef.current += 1;
    stopStream();
    setShot({ file, url: URL.createObjectURL(blob) });
    setStatus('shot');
  };

  const retake = () => {
    setShot(null);
    void start(deviceId);
  };

  const use = () => {
    if (!shot) return;
    onCapture(shot.file);
    close();
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const index = cameras.findIndex((c) => c.deviceId === deviceId);
    const next = cameras[(index + 1) % cameras.length];
    if (next) void start(next.deviceId);
  };

  const pickLibrary = () => {
    close();
    onPickLibrary();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in-overlay fixed inset-0 z-[10020] flex items-stretch justify-center bg-black/80 sm:items-center sm:p-6">
          <Dialog.Content
            aria-describedby={undefined}
            className="flex w-full flex-col overflow-hidden bg-neutral-950 pt-[var(--safe-top)] text-white sm:max-w-2xl sm:rounded-3xl sm:pt-0 sm:shadow-2xl"
          >
            <div className="flex shrink-0 items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-base font-extrabold text-white">Chụp ảnh check-in</Dialog.Title>
                {placeName && <p className="truncate text-xs text-white/60">{placeName}</p>}
              </div>
              <Dialog.Close aria-label="Đóng camera" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>

            {/* Khung xem trước: giữ trọn khung hình (object-contain) để ảnh chụp đúng như đang thấy */}
            <div className="relative min-h-[50vh] flex-1 bg-black sm:aspect-[4/3] sm:min-h-0 sm:flex-none">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`absolute inset-0 h-full w-full object-contain ${status === 'live' ? 'opacity-100' : 'opacity-0'} ${mirrored ? '-scale-x-100' : ''}`}
              />
              {shot && <img src={shot.url} alt="Ảnh vừa chụp" className="absolute inset-0 h-full w-full object-contain" />}
              {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" aria-hidden />}
              {status === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/70" role="status">
                  <Loader2 className="h-7 w-7 animate-spin" />
                  Đang mở camera… Nếu trình duyệt hỏi, hãy bấm <strong className="text-white">Cho phép</strong>.
                </div>
              )}
              {status === 'error' && error && (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="max-w-sm text-center" role="alert">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                      <CameraOff className="h-7 w-7 text-amber-300" />
                    </span>
                    <p className="mt-3 text-base font-extrabold">{error.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-white/70">{error.body}</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button type="button" onClick={() => { void start(deviceId); }} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900 cursor-pointer">
                        <RefreshCw className="h-4 w-4" /> Thử lại
                      </button>
                      <button type="button" onClick={pickLibrary} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/20 cursor-pointer">
                        <ImagePlus className="h-4 w-4" /> Chọn ảnh có sẵn
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Hàng điều khiển: đổi camera · nút chụp · thư viện — hoặc Chụp lại / Dùng ảnh này */}
            <div className="shrink-0 px-6 pb-[calc(1.25rem+var(--safe-bottom))] pt-4 sm:pb-5">
              {status === 'shot' ? (
                <div className="flex items-center justify-center gap-3">
                  <button type="button" onClick={retake} className="inline-flex h-12 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/20 cursor-pointer">
                    <RotateCcw className="h-4 w-4" /> Chụp lại
                  </button>
                  <button type="button" onClick={use} className="inline-flex h-12 items-center gap-2 rounded-full bg-[#0a7d64] px-6 text-sm font-bold text-white shadow-lg hover:bg-[#06604a] cursor-pointer">
                    <Check className="h-5 w-5" strokeWidth={3} /> Dùng ảnh này
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 items-center">
                  <div className="flex justify-start">
                    {cameras.length > 1 && status === 'live' && (
                      <button type="button" onClick={switchCamera} aria-label="Đổi camera" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer">
                        <SwitchCamera className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => { void capture(); }}
                      disabled={status !== 'live'}
                      aria-label="Chụp ảnh"
                      className="group flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/90 transition-transform active:scale-95 disabled:opacity-40 cursor-pointer"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-900 transition-colors group-hover:bg-amber-100">
                        <Camera className="h-6 w-6" />
                      </span>
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button type="button" onClick={pickLibrary} aria-label="Chọn ảnh có sẵn" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer">
                      <ImagePlus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
