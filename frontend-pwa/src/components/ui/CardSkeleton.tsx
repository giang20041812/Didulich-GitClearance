import React from 'react';
import { CardGridSkeleton } from './ListPageSkeleton';

interface CardSkeletonProps {
  count?: number;
  layout?: 'grid-2' | 'grid-3' | 'grid-4' | 'list' | 'compact' | 'compact-full';
  imageHeight?: string;
  hasTag?: boolean;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  count = 6,
  layout = 'grid-2',
  imageHeight = 'h-48 md:h-52',
}) => {
  // Thẻ gọn: dùng đúng khung chờ của CompactPlaceCard (ảnh 16:10, tên, địa điểm, giá).
  if (layout === 'compact' || layout === 'compact-full') {
    return <CardGridSkeleton count={count} withSidebar={layout === 'compact'} />;
  }

  const getGridClass = () => {
    switch (layout) {
      case 'grid-4':
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5';
      case 'grid-3':
        return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5';
      case 'list':
        return 'flex flex-col gap-4';
      case 'grid-2':
      default:
        return 'grid grid-cols-1 md:grid-cols-2 gap-5';
    }
  };

  return (
    <div className={getGridClass()}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="bg-white rounded-lg p-4 border border-gray-100 shadow-xs animate-pulse flex flex-col justify-between"
        >
          <div>
            {/* Ảnh cover placeholder */}
            <div className={`w-full ${imageHeight} bg-gray-200 rounded-md mb-3`} />
            
            {/* Tiêu đề */}
            <div className="h-4 bg-gray-200 rounded-sm w-3/4 mb-2.5" />
            
            {/* Địa chỉ / Mô tả ngắn */}
            <div className="h-3 bg-gray-100 rounded-sm w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded-sm w-5/6 mb-4" />
          </div>

          {/* Dòng giá & nút hành động */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between mt-auto">
            <div className="h-5 bg-gray-200 rounded-sm w-1/3" />
            <div className="h-8 bg-gray-200 rounded-md w-24" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default CardSkeleton;
