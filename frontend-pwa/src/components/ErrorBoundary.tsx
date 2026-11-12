import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Chặn lỗi render không bắt được: thay vì màn hình trắng, hiện thông báo
 * và cho phép tải lại. Lỗi được log ra console để xử dụng khi người dùng báo cáo.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, errorMessage: error instanceof Error ? `${error.name}: ${error.message}` : 'Lỗi giao diện không xác định' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Lỗi giao diện không xử lý được:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F7F5ED] px-6 text-center text-[#043D32]"
        >
          <h1 className="text-xl font-semibold">Đã xảy ra lỗi hiển thị</h1>
          <p className="max-w-md text-sm opacity-80">
            Trang gặp sự cố không mong muốn. Vui lòng tải lại; nếu vẫn lỗi, xoá bộ nhớ đệm trình duyệt rồi thử lại.
          </p>
          <details className="max-w-md break-words text-left text-xs">
            <summary className="cursor-pointer text-center">Chi tiết lỗi</summary>
            <p className="mt-2">{this.state.errorMessage}</p>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-[#043D32] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
