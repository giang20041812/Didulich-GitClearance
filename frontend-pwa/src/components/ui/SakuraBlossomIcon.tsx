import React from 'react';

export const SakuraBlossomIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4 shrink-0',
}) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="sakuraPetalGradCommon" x1="50%" y1="100%" x2="50%" y2="0%">
        <stop offset="0%" stopColor="#fff5f7" />
        <stop offset="40%" stopColor="#fce7f3" />
        <stop offset="80%" stopColor="#f472b6" />
        <stop offset="100%" stopColor="#ec4899" />
      </linearGradient>
      <path
        id="sakuraPetalShapeCommon"
        d="M 50 50 C 40 38, 24 26, 35 12 C 40 5, 46 8, 50 14 C 54 8, 60 5, 65 12 C 76 26, 60 38, 50 50 Z"
      />
    </defs>

    {/* 5 cánh hoa anh đào thật xếp lớp xoay 72 độ quanh tâm */}
    <g>
      <use href="#sakuraPetalShapeCommon" fill="url(#sakuraPetalGradCommon)" stroke="#f472b6" strokeWidth="0.8" />
      <use href="#sakuraPetalShapeCommon" transform="rotate(72 50 50)" fill="url(#sakuraPetalGradCommon)" stroke="#f472b6" strokeWidth="0.8" />
      <use href="#sakuraPetalShapeCommon" transform="rotate(144 50 50)" fill="url(#sakuraPetalGradCommon)" stroke="#f472b6" strokeWidth="0.8" />
      <use href="#sakuraPetalShapeCommon" transform="rotate(216 50 50)" fill="url(#sakuraPetalGradCommon)" stroke="#f472b6" strokeWidth="0.8" />
      <use href="#sakuraPetalShapeCommon" transform="rotate(288 50 50)" fill="url(#sakuraPetalGradCommon)" stroke="#f472b6" strokeWidth="0.8" />
    </g>

    {/* Nhụy hoa anh đào vàng óng và các sợi phấn hoa vươn tỏa */}
    <circle cx="50" cy="50" r="5" fill="#fde047" stroke="#eab308" strokeWidth="1" />
    <g stroke="#eab308" strokeWidth="0.75" opacity="0.9">
      <line x1="50" y1="50" x2="50" y2="38" />
      <line x1="50" y1="50" x2="61" y2="42" />
      <line x1="50" y1="50" x2="57" y2="60" />
      <line x1="50" y1="50" x2="43" y2="60" />
      <line x1="50" y1="50" x2="39" y2="42" />
      <line x1="50" y1="50" x2="55" y2="36" />
      <line x1="50" y1="50" x2="63" y2="52" />
      <line x1="50" y1="50" x2="47" y2="64" />
      <line x1="50" y1="50" x2="35" y2="52" />
      <line x1="50" y1="50" x2="44" y2="36" />
    </g>
    <g fill="#ca8a04">
      <circle cx="50" cy="37" r="2.2" />
      <circle cx="62" cy="41" r="2.2" />
      <circle cx="58" cy="61" r="2.2" />
      <circle cx="42" cy="61" r="2.2" />
      <circle cx="38" cy="41" r="2.2" />
      <circle cx="56" cy="35" r="2.2" />
      <circle cx="64" cy="53" r="2.2" />
      <circle cx="46" cy="65" r="2.2" />
      <circle cx="34" cy="51" r="2.2" />
      <circle cx="43" cy="35" r="2.2" />
      <circle cx="50" cy="50" r="2.5" fill="#f59e0b" stroke="#b45309" />
    </g>
  </svg>
);

export default SakuraBlossomIcon;
