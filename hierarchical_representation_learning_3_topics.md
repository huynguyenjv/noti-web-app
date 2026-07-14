# Ba Hướng Nghiên Cứu về Hierarchical Semantic Representation Learning trong Computer Vision

**Tài liệu phân tích chuyên sâu — định hướng công bố Q1/Q2 và hội nghị hạng A**

---

## Mục lục

1. [Bối cảnh chung và cơ sở lý thuyết](#1-bối-cảnh-chung)
2. [Topic 1 — Hierarchy-Aware Representation Learning cho Aerial-Ground Person Re-Identification](#2-topic-1)
3. [Topic 2 — Geometry-Agnostic Hierarchical Contrastive Objectives](#3-topic-2)
4. [Topic 3 — Hierarchical/Hyperbolic Representation cho Medical Imaging](#4-topic-3)
5. [So sánh ba hướng và ma trận quyết định](#5-so-sánh)
6. [Tài liệu tham khảo chính](#6-tài-liệu-tham-khảo)

---

## 1. Bối cảnh chung và cơ sở lý thuyết {#1-bối-cảnh-chung}

### 1.1. Vấn đề cốt lõi

Hầu hết các pipeline học biểu diễn (representation learning) hiện nay đối xử với nhãn như một tập **phẳng (flat)**: mọi lớp đều "cách đều nhau" về mặt ngữ nghĩa. Trong thực tế, nhãn hầu như luôn có cấu trúc **phân cấp (hierarchy)** — cây taxonomy WordNet của ImageNet, cây organ → tissue → subtype trong ảnh y tế, hay identity → nhóm thuộc tính → thuộc tính chi tiết trong Person ReID.

Việc bỏ qua cấu trúc này gây ra ba hệ quả:

1. **Lỗi "nghiêm trọng như nhau"**: nhầm chó Husky thành chó Malamute bị phạt ngang với nhầm Husky thành... xe tải. Bertinetto et al. (CVPR 2020, *Making Better Mistakes*) chỉ ra rằng mistake severity của các mô hình hiện đại hầu như không giảm suốt một thập kỷ, dù top-1 accuracy tăng liên tục.
2. **Biểu diễn không phản ánh ngữ nghĩa**: hai lớp anh em (sibling) trong taxonomy có thể nằm rất xa nhau trong embedding space, làm suy yếu khả năng transfer, few-shot và retrieval.
3. **Lãng phí tín hiệu giám sát**: annotation phân cấp (thường có sẵn miễn phí từ metadata) không được tận dụng.

### 1.2. Ba dòng kỹ thuật chính trong literature

**(a) Hierarchical losses & label embedding (Euclidean).** Nhúng nhãn thành vector sao cho khoảng cách phản ánh quan hệ ngữ nghĩa; hoặc thiết kế loss phạt theo khoảng cách trên cây (tree distance). Đại diện: hierarchical cross-entropy, soft labels theo lowest common ancestor (LCA), hierarchical triplet loss (Ge, ECCV 2018).

**(b) Hyperbolic representation learning.** Không gian hyperbolic (Poincaré ball, Lorentz model) có thể nhúng cây với độ méo (distortion) gần bằng 0 — điều bất khả thi trong không gian Euclid số chiều thấp, vì thể tích hyperbolic tăng theo hàm mũ theo bán kính, khớp với tốc độ tăng số node theo độ sâu của cây. Dòng này khởi nguồn từ Poincaré Embeddings (Nickel & Kiela, NeurIPS 2017), vào computer vision qua Hyperbolic Image Embeddings (Khrulkov et al., CVPR 2020), và đã có survey riêng trên IJCV 2024 (Mettes et al.).

**(c) Hierarchy-aware contrastive learning.** Sửa đổi supervised contrastive loss (SupCon, Khosla et al., NeurIPS 2020) để cường độ kéo/đẩy giữa các cặp mẫu tỷ lệ với số tổ tiên chung (shared ancestors). Đại diện: HiMulCon/HiMulConE (Zhang et al., CVPR 2022), HWC + LAM (arXiv:2511.03771), Level-Restricted Contrastive Learning (arXiv:2606.21838).

### 1.3. Khoảng trống (gaps) làm nền cho ba topic

- **Gap 1**: Person ReID — đặc biệt là bài toán aerial-ground với domain gap lớn — gần như chưa có công trình nào model hierarchy (view → attribute → identity) một cách tường minh. → **Topic 1**.
- **Gap 2**: Các objective hierarchy-aware hiện tại (HWC, LAM) còn thô sơ: trọng số cố định theo tầng, chưa thích ứng theo độ khó, và chưa ai kết nối hierarchy với cấu trúc **Matryoshka** (coarse-to-fine theo chiều embedding). → **Topic 2**.
- **Gap 3**: Medical imaging có taxonomy tự nhiên và cực kỳ giàu (ICD, tổ chức mô học) nhưng các phương pháp hierarchy-aware mới chỉ chạm tới classification; segmentation phân cấp + hyperbolic prototypes trong y tế còn rất thưa. → **Topic 3**.

---
## 2. Topic 1 — Hierarchy-Aware Representation Learning cho Aerial-Ground Person Re-Identification {#2-topic-1}

> **Một câu tóm tắt**: Domain gap aerial↔ground trong ReID về bản chất là một cấu trúc phân cấp (platform → view → attribute group → identity); mô hình hóa tường minh cấu trúc này bằng hierarchical contrastive loss và/hoặc hyperbolic embedding sẽ cho biểu diễn bền vững hơn qua các góc nhìn.

### 2.1. Động cơ và tính mới

**Tại sao ReID cần hierarchy?** Trong AG-ReID.v2, mỗi identity đi kèm bộ thuộc tính mềm (soft biometrics): giới tính, nhóm tuổi, kiểu tóc, màu áo, loại trang phục, vật mang theo... Các thuộc tính này tạo thành một cây ngữ nghĩa tự nhiên:

```
root
├── giới tính (nam / nữ)
│   ├── nhóm tuổi (trẻ / trung niên / lớn tuổi)
│   │   ├── nhóm trang phục (áo dài tay / ngắn tay × màu chủ đạo)
│   │   │   └── identity (ID cụ thể)
```

Hai identity khác nhau nhưng cùng "nam, trẻ, áo đen" nên **gần nhau hơn** trong embedding space so với hai identity khác hoàn toàn — flat ID loss (cross-entropy + triplet) hiện tại của TransReID không hề mã hóa điều này. Khi camera aerial làm mất chi tiết khuôn mặt/kết cấu vải, chính các tầng thô (coarse level) của cây là "phao cứu sinh" giúp thu hẹp không gian tìm kiếm.

**Tại sao chưa ai làm?** Cộng đồng ReID tập trung vào kiến trúc (ViT, part-based, attention) và domain alignment (adversarial, style transfer). Hierarchy-aware objectives phát triển chủ yếu trong image classification — hai cộng đồng ít giao nhau. Đây là cơ hội "kết hôn" hai dòng literature với chi phí novelty vừa phải nhưng câu chuyện thuyết phục.

### 2.2. Phương pháp đề xuất (phác thảo kỹ thuật)

**Backbone**: giữ nguyên TransReID (ViT-B + SIE + JPM) — bạn đã có pipeline chạy được trên `nam0403/ReID_Advance`.

**Thành phần 1 — Xây label tree từ attributes.** Không cần annotate thêm. Chọn 3–4 thuộc tính ổn định nhất qua view (giới tính, nhóm tuổi, màu áo chủ đạo, loại trang phục) làm các tầng L1→L3; identity là lá L4. Kiểm chứng độ ổn định thuộc tính qua view bằng thống kê trên tập train (thuộc tính nào bị đổi nhãn nhiều giữa aerial/ground thì loại).

**Thành phần 2 — Hierarchy-Weighted Contrastive (HWC) loss cho ReID.** Với batch B, cặp mẫu (i, j) có trọng số dương/âm tỷ lệ với số tổ tiên chung a(i,j):

```
w(i,j) = λ^( L − a(i,j) )      với λ ∈ (0,1), L = độ sâu cây
L_HWC = − Σ_i Σ_{j∈P(i)} w(i,j) · log[ exp(z_i·z_j/τ) / Σ_k exp(z_i·z_k/τ) ]
```

Điểm cải tiến so với HWC gốc (medical imaging): thêm **cross-view weighting** — cặp positive khác platform (aerial–ground) được nhân hệ số β > 1 để loss ưu tiên kéo hai view của cùng identity/cùng nhánh về gần nhau. Đây là đóng góp riêng cho ReID mà bài gốc không có.

**Thành phần 3 (tùy chọn, nâng novelty) — Hyperbolic projection head.** Thay projection head Euclid bằng exponential map lên Poincaré ball; prototype của các node trong cây được đặt trước (pre-embedded) bằng thuật toán nhúng cây low-distortion, ảnh được kéo về prototype lá của nó bằng khoảng cách hyperbolic. So sánh Euclid vs hyperbolic chính là một ablation "ăn tiền" cho reviewer.

**Loss tổng**: `L = L_ID + L_triplet + α·L_HWC (+ γ·L_hyp)` — giữ hai loss gốc của TransReID để đảm bảo không tụt baseline.

### 2.3. Kế hoạch thí nghiệm

| Nhóm | Nội dung | Mục đích |
|---|---|---|
| Baseline | TransReID nguyên bản trên AG-ReID.v2 (A→G, G→A) | Mốc so sánh |
| +HWC | Thêm hierarchical contrastive | Đóng góp chính |
| +Cross-view β | Bật/tắt trọng số cross-view | Ablation 1 |
| Euclid vs Hyperbolic | Hai geometry của projection head | Ablation 2 |
| Độ sâu cây | L = 2, 3, 4 tầng | Ablation 3 |
| Metric | mAP, Rank-1/5/10 + **hierarchy-aware metrics** (H-Acc theo tree distance, attribute consistency của top-k retrieval) | Điểm nhấn đánh giá |
| Generalization | Train AG-ReID.v2 → test CARGO / G2APS (cross-dataset) | Chứng minh robustness |

Chi phí ước tính: 1 GPU 24GB (bạn đã train được TransReID nên khả thi), mỗi run ~1 ngày, tổng ~15–20 run.

### 2.4. Venue mục tiêu và khung thời gian

- **Journal Q1**: Pattern Recognition, IEEE TCSVT, IEEE TIP (nếu kết quả rất mạnh), Information Fusion.
- **Journal Q2 an toàn**: Neurocomputing, Image and Vision Computing, Pattern Recognition Letters.
- **Hội nghị hạng A/B**: WACV, BMVC, ICPR, ACCV.
- **Timeline**: tháng 1–2 baseline + xây tree; tháng 2–4 HWC + ablation; tháng 4–5 hyperbolic + cross-dataset; tháng 5–6 viết bài. Tổng ~6 tháng.

### 2.5. Rủi ro và phương án dự phòng

| Rủi ro | Xác suất | Dự phòng |
|---|---|---|
| Attribute nhiễu ở ảnh aerial làm cây sai | Trung bình | Lọc thuộc tính theo độ ổn định; dùng soft weighting thay hard tree |
| HWC không cải thiện mAP | Thấp–TB | Nhấn mạnh hierarchy-aware metrics + qualitative retrieval (lỗi "nhẹ hơn") — đây vẫn là contribution hợp lệ |
| Reviewer chê "chỉ là áp dụng loss có sẵn" | Trung bình | Cross-view weighting + hyperbolic head + metric mới cho ReID là 3 delta đủ để phản biện |

---
## 3. Topic 2 — Geometry-Agnostic Hierarchical Contrastive Objectives {#3-topic-2}

> **Một câu tóm tắt**: Đề xuất một họ objective hierarchy-aware mới, thích ứng theo độ khó và độ sâu cây, đồng thời liên kết hierarchy với cấu trúc Matryoshka (mỗi prefix chiều embedding mã hóa một tầng ngữ nghĩa) — chạy được trên cả không gian Euclid lẫn hyperbolic mà không đổi kiến trúc.

### 3.1. Động cơ và tính mới

Đây là hướng **methodological** thuần túy — rủi ro cao hơn Topic 1 nhưng trần (ceiling) cũng cao hơn (có cửa A* nếu kết quả đẹp).

**Điểm yếu của các objective hiện tại:**
- HWC (arXiv:2511.03771) dùng trọng số **cố định** theo số tổ tiên chung — không phân biệt cặp dễ/khó, dễ bị "đè" bởi các cặp dễ ở tầng thô.
- LAM đặt margin theo tầng nhưng **tĩnh** — không thích ứng theo mật độ dữ liệu từng nhánh.
- Matryoshka Representation Learning (Kusupati et al., NeurIPS 2022) tạo biểu diễn coarse-to-fine theo chiều, nhưng **chưa gắn với hierarchy ngữ nghĩa**: prefix ngắn không được ràng buộc phải mã hóa lớp cha.

**Ý tưởng cốt lõi — "Matryoshka-Hierarchy Alignment" (MHA):** ràng buộc để prefix `d_1` chiều đầu của embedding phân biệt tốt các lớp ở **tầng thô** (coarse), prefix `d_2 > d_1` phân biệt tầng trung, và full-dim phân biệt lá. Nói cách khác: **độ sâu ngữ nghĩa của nhãn ↔ số chiều embedding được kích hoạt**. Đây là ánh xạ chưa ai formalize tường minh — và nó "hợp lý về mặt thông tin": lớp thô cần ít bit hơn để mô tả.

### 3.2. Phương pháp đề xuất

**Thành phần 1 — Adaptive Hierarchy-Weighted Contrastive.** Thay trọng số cố định `λ^(L−a)` bằng trọng số phụ thuộc độ khó (hard example mining trong từng tầng):

```
w(i,j) = softmax_k( sim(z_i, z_k) ) restricted trong cùng tầng LCA
```

giúp loss tự tập trung vào cặp gần biên giữa các nhánh anh em (sibling) — nơi lỗi phân cấp hay xảy ra.

**Thành phần 2 — MHA loss.** Với các mức chiều lồng nhau `d_1 ⊂ d_2 ⊂ ... ⊂ D` và các tầng cây `l_1 (coarse) ... l_L (fine)`:

```
L_MHA = Σ_m  SupCon( z[:d_m] , labels ở tầng l_m )
```

Prefix ngắn bị buộc phân biệt lớp thô → khi inference có thể **cắt chiều để đổi giữa tốc độ và độ chi tiết** mà vẫn giữ nhất quán ngữ nghĩa. Đây là tính năng thực dụng (adaptive retrieval) hiếm objective nào có.

**Thành phần 3 — Geometry-agnostic.** Toàn bộ chỉ phụ thuộc vào hàm khoảng cách `sim(·,·)`; thay bằng khoảng cách Poincaré là chuyển sang hyperbolic, không đổi phần còn lại. Cho phép một bảng ablation Euclid vs hyperbolic sạch đẹp.

### 3.3. Kế hoạch thí nghiệm

| Thành phần | Chi tiết |
|---|---|
| Datasets | CIFAR-100 (cây 20 superclass → 100 lớp), tieredImageNet, iNaturalist-2018/2019 (cây sinh học sâu), ImageNet-1k với WordNet |
| Baselines | SupCon, HiMulConE, HWC+LAM, Matryoshka gốc, cross-entropy phân cấp |
| Metrics | top-1, **hierarchical F1 (HF1)**, **tree-distance-weighted accuracy (H-Acc)**, mistake severity (LCA height trung bình của lỗi), retrieval mAP ở nhiều mức chiều |
| Ablation | (a) adaptive vs fixed weighting; (b) có/không MHA; (c) Euclid vs hyperbolic; (d) số mức chiều Matryoshka; (e) độ sâu cây |
| Tài nguyên | CIFAR/tieredImageNet chạy được trên 1–2 GPU; iNaturalist/ImageNet cần nhiều hơn — có thể để làm phần "scale-up" nếu tài nguyên cho phép |

### 3.4. Venue mục tiêu

- **Nếu kết quả mạnh + có iNaturalist/ImageNet**: nhắm CVPR/ICCV/NeurIPS (A*) — nhưng cần viết rất tốt và bảng so sánh đầy đủ.
- **An toàn Q1**: IJCV, Pattern Recognition, IEEE TIP, Machine Learning (Springer).
- **Q2**: Neurocomputing, Applied Intelligence (bài MgRCL đã đăng ở đây → precedent tốt).

### 3.5. Rủi ro

Rủi ro chính là **đấu trực diện với các nhóm mạnh** (UvA/Mettes, các lab hyperbolic). MHA là delta đủ mới để tránh bị coi là incremental, nhưng cần chứng minh nó **không chỉ đúng trên toy dataset**. Nếu iNaturalist/ImageNet vượt tài nguyên, hạ mục tiêu xuống Q1 journal với CIFAR-100 + tieredImageNet + một domain thực (ví dụ chính AG-ReID.v2 của Topic 1) là hoàn toàn hợp lý — và tạo cầu nối giữa hai topic.

---

## 4. Topic 3 — Hierarchical/Hyperbolic Representation cho Medical Imaging {#4-topic-3}

> **Một câu tóm tắt**: Đưa taxonomy y khoa (organ → tissue → subtype, hoặc cây chẩn đoán) vào cả phân loại lẫn phân đoạn ảnh y tế thông qua hyperbolic prototypes và hierarchy-preserving loss, hướng tới dự đoán "an toàn hơn về mặt lâm sàng" (lỗi rơi vào lớp cha thay vì lớp xa lạ).

### 4.1. Động cơ và tính mới

Cộng đồng medical imaging **ưa chuộng đóng góp "áp dụng thông minh + đánh giá lâm sàng chắc chắn"** hơn là novelty lý thuyết thuần túy — nên rào cản novelty thấp hơn CVPR, trong khi venue vẫn Q1 top (Medical Image Analysis, IEEE TMI).

**Gap cụ thể:** bài "Climbing the Label Tree" (arXiv:2511.03771) mới chỉ làm **classification** (breast histopathology). Segmentation phân cấp trong y tế — nơi mỗi pixel thuộc một đường đi trên cây giải phẫu — gần như bỏ ngỏ, dù HSSN (Li et al., CVPR 2022) đã chứng minh ý tưởng này khả thi trên ảnh tự nhiên.

**Lợi thế cá nhân:** bạn từng làm brain tumor segmentation từ MRI — có sẵn domain knowledge và có thể tái dùng dữ liệu/pipeline (BraTS có cấu trúc phân cấp tự nhiên: whole tumor ⊃ tumor core ⊃ enhancing tumor).

### 4.2. Phương pháp đề xuất

**Hướng A — Hierarchical segmentation cho tumor (khuyến nghị).** BraTS có 3 vùng lồng nhau (WT ⊃ TC ⊃ ET) — đúng là một cây 3 tầng. Đề xuất:
- Pixel embedding được kéo về **hyperbolic prototypes** của từng node, prototype đặt theo quan hệ bao hàm (entailment cones — vùng con nằm "trong nón" của vùng cha).
- Hierarchy-preserving loss đảm bảo dự đoán nhất quán: pixel là ET thì bắt buộc cũng là TC và WT (tree-consistency), loại bỏ các dự đoán "vi phạm cấu trúc" mà mô hình phẳng hay mắc.

**Hướng B — Hierarchical classification cho da liễu / mô học.** Tái hiện + cải tiến HWC/LAM trên taxonomy bệnh (ví dụ ISIC skin lesion có cây benign/malignant → subtype), thêm hyperbolic prototypes và metric lâm sàng.

**Loss:** `L = L_seg (Dice+CE) + α·L_hierarchy-preserving + γ·L_hyperbolic-prototype`.

### 4.3. Kế hoạch thí nghiệm

| Thành phần | Chi tiết |
|---|---|
| Datasets | BraTS (segmentation, cây WT/TC/ET); ISIC hoặc PatchCamelyon/BRACS (classification phân cấp) |
| Baselines | nnU-Net / Swin-UNETR (flat) cho seg; ResNet/ViT + SupCon cho cls |
| Metrics | Dice/HD95 từng vùng + **tree-consistency violation rate**, HF1, H-Acc; với cls thêm mistake severity lâm sàng |
| Ablation | Euclid vs hyperbolic prototype; có/không tree-consistency constraint; độ sâu cây |
| Điểm nhấn lâm sàng | Chứng minh lỗi của mô hình "an toàn hơn" (rơi vào lớp cha) — rất được reviewer y tế đánh giá cao |

### 4.4. Venue mục tiêu

- **Q1 top**: Medical Image Analysis (MedIA), IEEE TMI.
- **Q1/Q2**: Computerized Medical Imaging and Graphics, Artificial Intelligence in Medicine, Computers in Biology and Medicine.
- **Hội nghị**: MICCAI (hạng A trong y tế), ISBI, MIDL.

### 4.5. Rủi ro

| Rủi ro | Dự phòng |
|---|---|
| Cần kiến thức lâm sàng để biện luận | Bám cấu trúc phân cấp đã chuẩn hóa sẵn (BraTS regions) → không cần bác sĩ định nghĩa cây |
| Baseline y tế (nnU-Net) rất mạnh, khó vượt Dice | Định vị đóng góp ở **consistency & safety**, không chỉ Dice — reviewer y tế coi trọng điều này |
| Dữ liệu hạn chế/khó xin | BraTS, ISIC, PatchCamelyon đều public, tải tự do |

---
## 5. So sánh ba hướng và ma trận quyết định {#5-so-sánh}

### 5.1. Bảng so sánh tổng hợp

| Tiêu chí | Topic 1 — ReID | Topic 2 — Objective mới | Topic 3 — Medical |
|---|---|---|---|
| **Loại đóng góp** | Application + method | Method thuần | Application + method |
| **Novelty ceiling** | Trung bình–cao | Cao (có cửa A*) | Trung bình |
| **Rủi ro** | Thấp | Cao | Thấp–trung bình |
| **Tận dụng thứ đang có** | ✅✅✅ (TransReID + AG-ReID.v2 đang chạy) | ⚠️ (phải dựng từ đầu) | ✅✅ (kinh nghiệm brain tumor) |
| **Chi phí tính toán** | Thấp (1 GPU) | Trung bình–cao (nếu scale lên ImageNet) | Trung bình |
| **Cạnh tranh trong lĩnh vực** | Vừa phải | Rất gắt | Vừa phải |
| **Venue thực tế** | Q1 (TCSVT, PR) / WACV, BMVC | Q1 (IJCV, TIP) / cửa A* | Q1 (MedIA, TMI) / MICCAI |
| **Thời gian tới bài đầu** | ~6 tháng | ~8–10 tháng | ~7–8 tháng |
| **Độ chắc "có bài"** | Cao | Trung bình | Cao |

### 5.2. Khuyến nghị

**Nếu mục tiêu là "chắc chắn có một bài Q1/hạng A trong ~6 tháng" → chọn Topic 1.**
Lý do: bạn đã có pipeline chạy được, dataset có sẵn attribute hierarchy (không tốn công annotate), cộng đồng ReID có nhiều venue Q1 quen thuộc với dạng đóng góp này, và câu chuyện "domain gap là một hierarchy" đủ mới để không bị coi là incremental. Rủi ro thấp nhất, đòn bẩy từ tài nguyên hiện có cao nhất.

**Nếu bạn muốn thử sức với A* và chấp nhận rủi ro cao hơn → Topic 2**, nhưng nên **kết hợp Topic 1 làm "phao"**: phát triển objective MHA ở Topic 2, rồi dùng chính AG-ReID.v2 làm một trong các benchmark. Như vậy hai topic bổ trợ nhau — nếu MHA không đủ mạnh cho A*, bạn vẫn có một bài ReID chắc chắn (Topic 1) và một bài method Q1.

**Topic 3 phù hợp nếu bạn muốn quay lại mảng y tế** đã có nền tảng, và ưu tiên venue y khoa (MedIA/TMI/MICCAI) nơi đóng góp "áp dụng thông minh + đánh giá an toàn lâm sàng" được đón nhận với rào cản novelty thấp hơn.

### 5.3. Lộ trình kết hợp đề xuất (tối ưu rủi ro/lợi ích)

```
Tháng 1–6:   Topic 1  →  nộp Q1/WACV  (đảm bảo có bài)
Tháng 4–12:  Topic 2  →  dùng lại AG-ReID.v2 + CIFAR-100/tieredImageNet
                          →  nhắm IJCV/TIP, thử cửa A*
(Song song)  Topic 3  →  để dành nếu muốn mở rộng sang y tế sau
```

Cách này biến ba topic rời rạc thành một **chương trình nghiên cứu mạch lạc về hierarchical representation learning**, đủ khối lượng cho một luận văn/thesis hoàn chỉnh.

---

## 6. Tài liệu tham khảo chính {#6-tài-liệu-tham-khảo}

**Survey & nền tảng**
- Mettes et al. *Hyperbolic Deep Learning in Computer Vision: A Survey.* IJCV 2024. (arXiv:2305.06611)
- Deng et al. *ImageNet: A Large-Scale Hierarchical Image Database.* CVPR 2009.
- Bertinetto et al. *Making Better Mistakes: Leveraging Class Hierarchies with Deep Networks.* CVPR 2020.

**Hyperbolic representation**
- Nickel & Kiela. *Poincaré Embeddings for Learning Hierarchical Representations.* NeurIPS 2017.
- Khrulkov et al. *Hyperbolic Image Embeddings.* CVPR 2020.
- Liu et al. *Hyperbolic Visual Embedding Learning for Zero-Shot Recognition.* CVPR 2020.
- Ghadimi Atigh et al. *Hyperbolic Image Segmentation.* CVPR 2022.
- van Spengler et al. *Poincaré ResNet.* ICCV 2023.
- *Multi-Prototype Hyperbolic Learning Guided by Class Hierarchy.* IJCV 2025.

**Hierarchical contrastive learning**
- Khosla et al. *Supervised Contrastive Learning.* NeurIPS 2020.
- Zhang et al. *Use All The Labels: A Hierarchical Multi-Label Contrastive Learning Framework (HiMulConE).* CVPR 2022.
- *Climbing the Label Tree: Hierarchy-Preserving Contrastive Learning for Medical Imaging.* arXiv:2511.03771 (2025).
- *Beyond Flat Labels: Level-Restricted Contrastive Learning for Hierarchical Fine-Grained Vision Classification.* arXiv:2606.21838.
- *MgRCL: Multi-granular Representation Contrastive Learning for Hierarchical Multi-label Classification.* Applied Intelligence 2025.

**Dense prediction & khác**
- Li et al. *Deep Hierarchical Semantic Segmentation (HSSN).* CVPR 2022.
- Kusupati et al. *Matryoshka Representation Learning.* NeurIPS 2022.
- Ge. *Deep Metric Learning with Hierarchical Triplet Loss.* ECCV 2018.

**Person ReID (cho Topic 1)**
- He et al. *TransReID: Transformer-based Object Re-Identification.* ICCV 2021.
- Nguyen et al. *AG-ReID.v2 (Aerial-Ground Person Re-Identification).* (dataset & benchmark)

---

*Tài liệu này tổng hợp và phân tích định hướng dựa trên literature hiện có tính đến đầu 2026. Các con số venue/ranking mang tính tham khảo tại thời điểm viết; nên kiểm tra lại deadline và scope cụ thể trước khi nộp.*
