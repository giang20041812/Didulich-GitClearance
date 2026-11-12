/**
 * Nguồn và giấy phép của mọi ảnh thật dùng trong dữ liệu mẫu và giao diện (trang /nguon-anh).
 * Sinh tự động từ danh mục ảnh đã kiểm tra bằng mắt (xem docs/bao-cao-anh-that.md) — sửa danh mục rồi sinh lại,
 * không sửa tay. Ảnh CC BY / CC BY-SA bắt buộc ghi tác giả + giấy phép + nguồn; ảnh CC0 / phạm vi công cộng ghi để minh bạch.
 */

export type PhotoFit = 'exact' | 'area' | 'illustration';

export interface PhotoCredit {
  key: string;
  /** Ảnh thực sự chụp gì (không phải tên địa điểm gắn ảnh). */
  subject: string;
  fit: PhotoFit;
  author: string;
  license: string;
  licenseUrl: string;
  source: 'Wikimedia Commons' | 'Flickr';
  sourceUrl: string;
  thumb: string;
  usedFor: string[];
}

export const PHOTO_FIT_LABEL: Record<PhotoFit, string> = {"exact": "đúng địa điểm / món", "area": "ảnh khu vực (cùng xã / huyện)", "illustration": "ảnh minh họa"};

export const PHOTO_CREDITS: PhotoCredit[] = [
  {
    "key": "dish_thangco",
    "subject": "Chảo thắng cố",
    "fit": "exact",
    "author": "Alpha",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Th%E1%BA%AFng_c%E1%BB%91.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Th%E1%BA%AFng_c%E1%BB%91.jpg/330px-Th%E1%BA%AFng_c%E1%BB%91.jpg",
    "usedFor": [
      "Món Thắng cố"
    ]
  },
  {
    "key": "suoigiang_tea",
    "subject": "Cây chè Shan tuyết cổ thụ ở Suối Giàng",
    "fit": "exact",
    "author": "Viethavvh",
    "license": "Public domain",
    "licenseUrl": "https://commons.wikimedia.org/wiki/File:Suoi_Giang_tea.JPG",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Suoi_Giang_tea.JPG",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Suoi_Giang_tea.JPG/330px-Suoi_Giang_tea.JPG",
    "usedFor": [
      "Đồi chè cổ thụ Suối Giàng"
    ]
  },
  {
    "key": "suoigiang_teatree",
    "subject": "Cây chè tổ ở Suối Giàng",
    "fit": "exact",
    "author": "Trasuoigiang",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:C%C3%A2y_ch%C3%A8_t%E1%BB%95.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/C%C3%A2y_ch%C3%A8_t%E1%BB%95.jpg/330px-C%C3%A2y_ch%C3%A8_t%E1%BB%95.jpg",
    "usedFor": [
      "Đồi chè cổ thụ Suối Giàng"
    ]
  },
  {
    "key": "khaupha_paragliding",
    "subject": "Dù lượn cất cánh từ đèo Khau Phạ, nhìn xuống bản Lìm Mông",
    "fit": "exact",
    "author": "Motbit",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Nh%E1%BA%A3y_d%C3%B9_l%C6%B0%E1%BB%A3n_t%E1%BB%AB_%C4%91%C3%A8o_Khau_Ph%E1%BA%A1_ng%E1%BA%AFm_b%E1%BA%A3n_L%C3%ACm_m%C3%B4ng.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Nh%E1%BA%A3y_d%C3%B9_l%C6%B0%E1%BB%A3n_t%E1%BB%AB_%C4%91%C3%A8o_Khau_Ph%E1%BA%A1_ng%E1%BA%AFm_b%E1%BA%A3n_L%C3%ACm_m%C3%B4ng.jpg/330px-Nh%E1%BA%A3y_d%C3%B9_l%C6%B0%E1%BB%A3n_t%E1%BB%AB_%C4%91%C3%A8o_Khau_Ph%E1%BA%A1_ng%E1%BA%AFm_b%E1%BA%A3n_L%C3%ACm_m%C3%B4ng.jpg",
    "usedFor": [
      "Lễ hội bay dù lượn Khau Phạ"
    ]
  },
  {
    "key": "market_family",
    "subject": "Gia đình người Mông xuống chợ ở Mù Cang Chải",
    "fit": "exact",
    "author": "Vũ Hùng (Panoramio)",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:C%E1%BA%A2_NH%C3%80_XU%E1%BB%90NG_CH%E1%BB%A2_-_panoramio.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/C%E1%BA%A2_NH%C3%80_XU%E1%BB%90NG_CH%E1%BB%A2_-_panoramio.jpg/330px-C%E1%BA%A2_NH%C3%80_XU%E1%BB%90NG_CH%E1%BB%A2_-_panoramio.jpg",
    "usedFor": [
      "Chợ phiên Mù Cang Chải"
    ]
  },
  {
    "key": "suoigiang_village",
    "subject": "Một góc bản Suối Giàng trong sương",
    "fit": "exact",
    "author": "ePi.Longo",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Suoigiang1.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Suoigiang1.jpg/330px-Suoigiang1.jpg",
    "usedFor": [
      "Đồi chè cổ thụ Suối Giàng"
    ]
  },
  {
    "key": "dish_thangco_market",
    "subject": "Nấu thắng cố ở chợ phiên vùng cao",
    "fit": "exact",
    "author": "Zennysmile",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Thang_Co_(Cattle_Intestines_Soup).jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Thang_Co_%28Cattle_Intestines_Soup%29.jpg/330px-Thang_Co_%28Cattle_Intestines_Soup%29.jpg",
    "usedFor": [
      "Ảnh đầu trang Nhà hàng",
      "Món Thắng cố"
    ]
  },
  {
    "key": "hmong_tet",
    "subject": "Phụ nữ Mông mặc trang phục truyền thống dịp Tết (chụp ở Bắc Hà, Lào Cai)",
    "fit": "exact",
    "author": "DTH-BD-NVT",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Hmong_women_with_traditional_costume.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Hmong_women_with_traditional_costume.jpg/330px-Hmong_women_with_traditional_costume.jpg",
    "usedFor": [
      "Ảnh đầu trang Văn hóa – Lễ hội",
      "Tết của người Mông"
    ]
  },
  {
    "key": "khaupha_road",
    "subject": "Quốc lộ 32 vắt qua đèo Khau Phạ (ảnh năm 2005)",
    "fit": "exact",
    "author": "Viethavvh",
    "license": "Public domain",
    "licenseUrl": "https://commons.wikimedia.org/wiki/File:Khau_Ph%E1%BA%A1.jpg",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Khau_Ph%E1%BA%A1.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Khau_Ph%E1%BA%A1.jpg/330px-Khau_Ph%E1%BA%A1.jpg",
    "usedFor": [
      "Ảnh đầu trang Di chuyển",
      "Đèo Khau Phạ",
      "Xe ôm Tú Lệ – Khau Phạ (mẫu)"
    ]
  },
  {
    "key": "khaupha_water",
    "subject": "Ruộng bậc thang Khau Phạ mùa nước đổ",
    "fit": "exact",
    "author": "Vũ Hùng (Panoramio)",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:KHAU_PH%E1%BA%A0_M%C3%99A_N%C6%AF%E1%BB%9AC_%C4%90%E1%BB%94_-_panoramio.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/KHAU_PH%E1%BA%A0_M%C3%99A_N%C6%AF%E1%BB%9AC_%C4%90%E1%BB%94_-_panoramio.jpg/330px-KHAU_PH%E1%BA%A0_M%C3%99A_N%C6%AF%E1%BB%9AC_%C4%90%E1%BB%94_-_panoramio.jpg",
    "usedFor": [
      "Đèo Khau Phạ",
      "Khau Phạ Cloud Hill"
    ]
  },
  {
    "key": "khaupha_terraces",
    "subject": "Ruộng bậc thang dưới đèo Khau Phạ, Mù Cang Chải",
    "fit": "exact",
    "author": "Doan Tuan (Unsplash)",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Khau_Ph%E1%BA%A1_Pass,_Vietnam_(Unsplash).jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Khau_Ph%E1%BA%A1_Pass%2C_Vietnam_%28Unsplash%29.jpg/330px-Khau_Ph%E1%BA%A1_Pass%2C_Vietnam_%28Unsplash%29.jpg",
    "usedFor": [
      "Đèo Khau Phạ",
      "Ảnh phòng homestay mẫu"
    ]
  },
  {
    "key": "limmong_1",
    "subject": "Ruộng bậc thang thung lũng Lìm Mông mùa lúa chín",
    "fit": "exact",
    "author": "jihadv",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Limmong1.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Limmong1.jpg/330px-Limmong1.jpg",
    "usedFor": [
      "Trekking ruộng bậc thang Lìm Mông (mẫu)"
    ]
  },
  {
    "key": "khaupha_above",
    "subject": "Thung lũng Cao Phạ nhìn từ trên đèo Khau Phạ",
    "fit": "exact",
    "author": "Victor311",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Khau_Ph%E1%BA%A1_nh%C3%ACn_t%E1%BB%AB_tr%C3%AAn_cao.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Khau_Ph%E1%BA%A1_nh%C3%ACn_t%E1%BB%AB_tr%C3%AAn_cao.jpg/330px-Khau_Ph%E1%BA%A1_nh%C3%ACn_t%E1%BB%AB_tr%C3%AAn_cao.jpg",
    "usedFor": [
      "Đèo Khau Phạ",
      "Khau Phạ Cloud Hill"
    ]
  },
  {
    "key": "limmong_3",
    "subject": "Thung lũng Lìm Mông, xã Cao Phạ",
    "fit": "exact",
    "author": "jihadv",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Limmong3.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Limmong3.jpg/330px-Limmong3.jpg",
    "usedFor": [
      "Trekking ruộng bậc thang Lìm Mông (mẫu)",
      "Khau Phạ Cloud Hill"
    ]
  },
  {
    "key": "tule_valley",
    "subject": "Thung lũng Tú Lệ lúc nắng chiều",
    "fit": "exact",
    "author": "An Bui (Vietnam Photo Tours)",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Tu_Le,_Yen_Bai.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Tu_Le%2C_Yen_Bai.jpg/330px-Tu_Le%2C_Yen_Bai.jpg",
    "usedFor": [
      "Ảnh đầu trang Cẩm nang",
      "Thung lũng Tú Lệ",
      "Tú Lệ Garden Homestay",
      "Ảnh phòng homestay mẫu"
    ]
  },
  {
    "key": "tule_lechamp",
    "subject": "Thung lũng Tú Lệ nhìn từ khu Nước Nóng, xã Tú Lệ",
    "fit": "exact",
    "author": "Dương Quỳnh Mai",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Le_Champ_image_-_taken_07042024.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Le_Champ_image_-_taken_07042024.jpg/330px-Le_Champ_image_-_taken_07042024.jpg",
    "usedFor": [
      "Thung lũng Tú Lệ",
      "Tú Lệ Garden Homestay"
    ]
  },
  {
    "key": "dish_xoingusac",
    "subject": "Xôi ngũ sắc của người Thái (chụp ở Sơn La)",
    "fit": "exact",
    "author": "Khương Việt Hà",
    "license": "Public domain",
    "licenseUrl": "https://commons.wikimedia.org/wiki/File:X%C3%B4i_ng%C5%A9_s%E1%BA%AFc.JPG",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:X%C3%B4i_ng%C5%A9_s%E1%BA%AFc.JPG",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/X%C3%B4i_ng%C5%A9_s%E1%BA%AFc.JPG/330px-X%C3%B4i_ng%C5%A9_s%E1%BA%AFc.JPG",
    "usedFor": [
      "Nhà hàng Xôi Tú Lệ",
      "Món Xôi nếp Tú Lệ ngũ sắc"
    ]
  },
  {
    "key": "mamxoi",
    "subject": "Đồi Mâm Xôi ở La Pán Tẩn mùa lúa chín",
    "fit": "exact",
    "author": "minhphuc_99kdd",
    "license": "Public Domain Mark 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Flickr",
    "sourceUrl": "https://www.flickr.com/photos/36755450@N05/23563013701/",
    "thumb": "https://live.staticflickr.com/773/23563013701_74c06f11bb_n.jpg",
    "usedFor": [
      "Đồi Mâm Xôi"
    ]
  },
  {
    "key": "lapantan_house",
    "subject": "Hiên nhà người Mông nhìn ra ruộng bậc thang, xã La Pán Tẩn",
    "fit": "area",
    "author": "Water Alternatives Photos (nguồn: Pixabay)",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "source": "Flickr",
    "sourceUrl": "https://www.flickr.com/photos/143925215@N04/33571997038/",
    "thumb": "https://live.staticflickr.com/7851/33571997038_6787f8ed57_n.jpg",
    "usedFor": [
      "La Pán Tẩn View"
    ]
  },
  {
    "key": "dexuphinh_water",
    "subject": "Ruộng bậc thang mùa nước đổ ở xã Dế Xu Phình",
    "fit": "area",
    "author": "Gió Đông",
    "license": "Public domain",
    "licenseUrl": "https://commons.wikimedia.org/wiki/File:Mu_Cang_Chai_02.JPG",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Mu_Cang_Chai_02.JPG",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Mu_Cang_Chai_02.JPG/330px-Mu_Cang_Chai_02.JPG",
    "usedFor": [
      "Sống Lưng Khủng Long"
    ]
  },
  {
    "key": "checunha_1",
    "subject": "Ruộng bậc thang xã Chế Cu Nha",
    "fit": "area",
    "author": "Tiên Ông (Panoramio)",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ch%E1%BA%BF_Cu_Nha,_M%C3%B9_Cang_Ch%E1%BA%A3i,_Y%C3%AAn_B%C3%A1i,_Vietnam_-_panoramio.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Ch%E1%BA%BF_Cu_Nha%2C_M%C3%B9_Cang_Ch%E1%BA%A3i%2C_Y%C3%AAn_B%C3%A1i%2C_Vietnam_-_panoramio.jpg/330px-Ch%E1%BA%BF_Cu_Nha%2C_M%C3%B9_Cang_Ch%E1%BA%A3i%2C_Y%C3%AAn_B%C3%A1i%2C_Vietnam_-_panoramio.jpg",
    "usedFor": [
      "Nhà sàn Chế Cu Nha"
    ]
  },
  {
    "key": "checunha_gold",
    "subject": "Ruộng bậc thang xã Chế Cu Nha mùa lúa chín",
    "fit": "area",
    "author": "Doan Tuan (Unsplash)",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Terraces_in_Che_Cu_Nha_commune,_Mu_Cang_Chai_(Unsplash).jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Terraces_in_Che_Cu_Nha_commune%2C_Mu_Cang_Chai_%28Unsplash%29.jpg/330px-Terraces_in_Che_Cu_Nha_commune%2C_Mu_Cang_Chai_%28Unsplash%29.jpg",
    "usedFor": [
      "Ảnh nền trang đăng nhập / đăng ký",
      "Nhà sàn Chế Cu Nha",
      "Lễ hội Mùa vàng Mù Cang Chải",
      "Ảnh phòng homestay mẫu"
    ]
  },
  {
    "key": "lapantan_mist",
    "subject": "Ruộng bậc thang xã La Pán Tẩn trong sương",
    "fit": "area",
    "author": "Văn Ngọc Tăng (Unsplash)",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:La_P%C3%A1n_T%E1%BA%A9n_Agriculture_(Unsplash).jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/La_P%C3%A1n_T%E1%BA%A9n_Agriculture_%28Unsplash%29.jpg/330px-La_P%C3%A1n_T%E1%BA%A9n_Agriculture_%28Unsplash%29.jpg",
    "usedFor": [
      "Ảnh đầu trang Điểm đến",
      "Đồi Mâm Xôi",
      "Đồi Móng Ngựa",
      "La Pán Tẩn View",
      "Ảnh phòng homestay mẫu"
    ]
  },
  {
    "key": "mcc_terrace",
    "subject": "Ruộng bậc thang ở Mù Cang Chải",
    "fit": "area",
    "author": "Hoang Giang Hai",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Rice_terrace.png",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Rice_terrace.png/330px-Rice_terrace.png",
    "usedFor": [
      "Mồ Dề Bamboo House"
    ]
  },
  {
    "key": "lapantan_terrace",
    "subject": "Ruộng bậc thang ở xã La Pán Tẩn",
    "fit": "area",
    "author": "jihadv",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Lapantan.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Lapantan.jpg/330px-Lapantan.jpg",
    "usedFor": [
      "Đồi Móng Ngựa",
      "La Pán Tẩn View"
    ]
  },
  {
    "key": "checunha_2",
    "subject": "Ruộng lúa và núi ở xã Chế Cu Nha",
    "fit": "area",
    "author": "Tiên Ông (Panoramio)",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ch%E1%BA%BF_Cu_Nha,_M%C3%B9_Cang_Ch%E1%BA%A3i,_Y%C3%AAn_B%C3%A1i,_Vietnam_-_panoramio_(1).jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Ch%E1%BA%BF_Cu_Nha%2C_M%C3%B9_Cang_Ch%E1%BA%A3i%2C_Y%C3%AAn_B%C3%A1i%2C_Vietnam_-_panoramio_%281%29.jpg/330px-Ch%E1%BA%BF_Cu_Nha%2C_M%C3%B9_Cang_Ch%E1%BA%A3i%2C_Y%C3%AAn_B%C3%A1i%2C_Vietnam_-_panoramio_%281%29.jpg",
    "usedFor": [
      "Nhà sàn Chế Cu Nha"
    ]
  },
  {
    "key": "mcc_morning",
    "subject": "Sáng sớm ở Mù Cang Chải",
    "fit": "area",
    "author": "Vũ Hùng (Panoramio)",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:S%C3%81NG_S%E1%BB%9AM_%E1%BB%9E_M%C3%99_CANG_CH%E1%BA%A2I_-_panoramio.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/S%C3%81NG_S%E1%BB%9AM_%E1%BB%9E_M%C3%99_CANG_CH%E1%BA%A2I_-_panoramio.jpg/330px-S%C3%81NG_S%E1%BB%9AM_%E1%BB%9E_M%C3%99_CANG_CH%E1%BA%A2I_-_panoramio.jpg",
    "usedFor": [
      "Mồ Dề Bamboo House",
      "Kim Nọi Retreat (bản nháp)",
      "Ảnh phòng homestay mẫu"
    ]
  },
  {
    "key": "mcc_town",
    "subject": "Thị trấn Mù Cang Chải mùa lúa chín",
    "fit": "area",
    "author": "Khoitran1957",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Mu_Cang_Chai_Town_-_Yen_Bai_-_Vietnam.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Mu_Cang_Chai_Town_-_Yen_Bai_-_Vietnam.jpg/330px-Mu_Cang_Chai_Town_-_Yen_Bai_-_Vietnam.jpg",
    "usedFor": [
      "Ảnh đầu trang Homestay",
      "Quán Gà Đen A Dế",
      "Chợ phiên Mù Cang Chải",
      "A Chu Homestay"
    ]
  },
  {
    "key": "mcc_road",
    "subject": "Đường vào thị trấn Mù Cang Chải",
    "fit": "area",
    "author": "Viethavvh",
    "license": "Public domain",
    "licenseUrl": "https://commons.wikimedia.org/wiki/File:Mu_Cang_Chai.jpg",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Mu_Cang_Chai.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Mu_Cang_Chai.jpg/330px-Mu_Cang_Chai.jpg",
    "usedFor": [
      "Ảnh đầu trang Tiện ích",
      "Limousine Hà Nội – Mù Cang Chải (mẫu)",
      "A Chu Homestay",
      "Kim Nọi Retreat (bản nháp)"
    ]
  },
  {
    "key": "hmong_house_inside",
    "subject": "Bên trong một ngôi nhà gỗ của người Mông (ảnh minh họa)",
    "fit": "illustration",
    "author": "hudry",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Inside_a_H%27Mong_house,_Vietnam.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Inside_a_H%27Mong_house%2C_Vietnam.jpg/330px-Inside_a_H%27Mong_house%2C_Vietnam.jpg",
    "usedFor": [
      "A Chu Homestay",
      "Mồ Dề Bamboo House",
      "Kim Nọi Retreat (bản nháp)",
      "Ảnh phòng homestay mẫu"
    ]
  },
  {
    "key": "dish_gaden",
    "subject": "Canh gà đen (ảnh minh họa món gà xương đen)",
    "fit": "illustration",
    "author": "Taiyo Fujii",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0/",
    "source": "Flickr",
    "sourceUrl": "https://www.flickr.com/photos/84326824@N00/761686172/",
    "thumb": "https://live.staticflickr.com/1018/761686172_e2bf839aa3_n.jpg",
    "usedFor": [
      "Quán Gà Đen A Dế",
      "Món Gà đen Mù Cang Chải"
    ]
  },
  {
    "key": "dish_papinhtop",
    "subject": "Cá nướng kiểu Tây Bắc (pa pỉnh tộp)",
    "fit": "illustration",
    "author": "Phương Huy",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Khu_%E1%BA%A9m_th%E1%BB%B1c_B%E1%BA%BFn_Ngh%C3%A9_ng13th8n2023_(c%C3%A1_n%C6%B0%E1%BB%9Bng_T%C3%A2y_B%E1%BA%AFc_Pa_t%E1%BB%89nh_t%E1%BB%99p)_(7).jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Khu_%E1%BA%A9m_th%E1%BB%B1c_B%E1%BA%BFn_Ngh%C3%A9_ng13th8n2023_%28c%C3%A1_n%C6%B0%E1%BB%9Bng_T%C3%A2y_B%E1%BA%AFc_Pa_t%E1%BB%89nh_t%E1%BB%99p%29_%287%29.jpg/330px-Khu_%E1%BA%A9m_th%E1%BB%B1c_B%E1%BA%BFn_Ngh%C3%A9_ng13th8n2023_%28c%C3%A1_n%C6%B0%E1%BB%9Bng_T%C3%A2y_B%E1%BA%AFc_Pa_t%E1%BB%89nh_t%E1%BB%99p%29_%287%29.jpg",
    "usedFor": [
      "Món Cá suối nướng"
    ]
  },
  {
    "key": "dish_com",
    "subject": "Cốm non (ảnh minh họa món cốm)",
    "fit": "illustration",
    "author": "Bình Giang",
    "license": "Public domain",
    "licenseUrl": "https://commons.wikimedia.org/wiki/File:Com.JPG",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Com.JPG",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Com.JPG/330px-Com.JPG",
    "usedFor": [
      "Món Cốm Tú Lệ"
    ]
  },
  {
    "key": "dish_lonnuong",
    "subject": "Lợn bản nướng nguyên con ở Sa Pa (ảnh minh họa món lợn bản nướng)",
    "fit": "illustration",
    "author": "@felixtriller",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0/",
    "source": "Flickr",
    "sourceUrl": "https://www.flickr.com/photos/21480682@N03/5058525120/",
    "thumb": "https://live.staticflickr.com/4090/5058525120_567249f8c1_n.jpg",
    "usedFor": [
      "Món Thịt lợn bản kẹp que nướng"
    ]
  },
  {
    "key": "xeom",
    "subject": "Xe ôm chở khách (ảnh minh họa)",
    "fit": "illustration",
    "author": "Bảo Trí Nguyễn",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:B%C3%A1c_xe_%C3%B4m_ch%E1%BB%9F_kh%C3%A1ch.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/B%C3%A1c_xe_%C3%B4m_ch%E1%BB%9F_kh%C3%A1ch.jpg/330px-B%C3%A1c_xe_%C3%B4m_ch%E1%BB%9F_kh%C3%A1ch.jpg",
    "usedFor": [
      "Xe ôm Tú Lệ – Khau Phạ (mẫu)"
    ]
  },
  {
    "key": "dish_xoinep_thai",
    "subject": "Xôi nếp đựng trong ép của người Thái",
    "fit": "illustration",
    "author": "Hà Nghĩa VN",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:X%C3%B4i_n%E1%BA%BFp_c%E1%BB%A7a_ng%C6%B0%E1%BB%9Di_Th%C3%A1i_b%E1%BA%A3n_Phe.jpg",
    "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/X%C3%B4i_n%E1%BA%BFp_c%E1%BB%A7a_ng%C6%B0%E1%BB%9Di_Th%C3%A1i_b%E1%BA%A3n_Phe.jpg/330px-X%C3%B4i_n%E1%BA%BFp_c%E1%BB%A7a_ng%C6%B0%E1%BB%9Di_Th%C3%A1i_b%E1%BA%A3n_Phe.jpg",
    "usedFor": [
      "Ảnh đầu trang Đặc sản",
      "Nhà hàng Xôi Tú Lệ",
      "Tú Lệ Garden Homestay",
      "Món Xôi nếp Tú Lệ ngũ sắc"
    ]
  }
];
