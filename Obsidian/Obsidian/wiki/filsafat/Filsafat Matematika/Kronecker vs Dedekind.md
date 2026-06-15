---
date: "2026-06-06"
tags:
  - "filsafat"
  - "matematika"
  - "sejarah"
  - "kronecker"
  - "dedekind"
related:
  - "[[filsafat matematika]]"
  - "[[Filsafat Matematika 2]]"
  - "[[Logisisme]]"
  - "[[Intuisionisme Matematika]]"
---

# Kronecker vs Dedekind

Perdebatan Leopold Kronecker dan Richard Dedekind pada abad ke-19 mengenai landasan epistemologis bilangan irasional: serta makna kesamaan ($=$) dan reduksi matematis.

## Konsep Reduksi dan Simbol $=$ menurut Kronecker
Kronecker menyatakan bahwa matematika harus diaritmetisasi: direduksi menjadi hubungan finitistik (bersifat terhingga atau hanya menerima yang terhingga. Hanya objek matematika yang bersifat terhingga yang benar-benar ada atau sah digunakan) antara bilangan asli ($\mathbb{N}$). 
* **Makna Kesamaan ($=$):** Bagi Kronecker: kesamaan melibatkan irasional seperti $a = b$ bukan mencerminkan kesamaan dua objek abstrak yang selesai. Simbol $=$ adalah pernyataan tentang **prosedur reduksi finitistik**. Proposisi matematika hanya sah jika dapat direduksi secara algoritmik dalam langkah terbatas ke bilangan asli agar dapat dipahami akal budi manusia. Jika tidak dapat direduksi: simbol tersebut dianggap fiktif.

---

## Perbedaan Kronecker dan Dedekind: Contoh $\sqrt{2}$

Perbedaan utama terletak pada status ontologis bilangan irasional seperti $\sqrt{2}$:

### 1. Pendekatan Dedekind: Potongan Dedekind (Dedekind Cut)
Dedekind mendefinisikan $\sqrt{2}$ sebagai partisi dari seluruh himpunan bilangan rasional $\mathbb{Q}$.

#### Rumus:
$$\sqrt{2} = (A, B)$$
Di mana:
$$A = \{ q \in \mathbb{Q} \mid q < 0 \text{ atau } q^2 < 2 \}$$
$$B = \{ q \in \mathbb{Q} \mid q > 0 \text{ dan } q^2 \ge 2 \}$$

#### Penjelasan Rumus:
* **Himpunan Tak Terhingga Aktual:** Dedekind membagi $\mathbb{Q}$ menjadi dua kelas ($A$ dan $B$) tanpa irisan. Nilai $\sqrt{2}$ didefinisikan sebagai *potongan* itu sendiri.
* **Status Ontologis:** Potongan ini adalah objek matematika yang selesai (*actual infinity*).
* **Kesamaan ($=$):** Dua bilangan real $(A_1, B_1)$ dan $(A_2, B_2)$ setara jika dan hanya jika $A_1 = A_2$: yang berarti membandingkan dua himpunan tak terhingga.

---

### 2. Pendekatan Kronecker: Aritmetisasi Aljabar
Kronecker menolak eksistensi $\sqrt{2}$ sebagai objek mandiri atau potongan tak terhingga. Ia menggantikannya dengan aritmetika modular pada polinomial dengan koefisien bilangan bulat.

#### Rumus:
$$x^2 \equiv 2 \pmod{x^2 - 2}$$

#### Penjelasan Rumus:
* **Penghindaran Irasional:** Kronecker memperlakukan $x$ sebagai variabel formal dalam ring polinomial $\mathbb{Z}[x]$ modulo ideal $(x^2 - 2)$.
* **Reduksi Aljabar:** Operasi perkalian $(a + b\sqrt{2})(c + d\sqrt{2}) = (ac + 2bd) + (ad + bc)\sqrt{2}$ diselesaikan sebagai perkalian polinomial yang direduksi modulo $x^2 - 2$:
  $$(a + bx)(c + dx) = ac + (ad + bc)x + bdx^2 \equiv (ac + 2bd) + (ad + bc)x \pmod{x^2 - 2}$$
* **Status Ontologis:** Tidak ada bilangan $\sqrt{2}$ yang nyata. Yang ada hanyalah aturan manipulasi aritmetika terbatas terhadap koefisien integer ($ac + 2bd$ dan $ad + bc$).
* **Kesamaan ($=$):** Simbol $=$ menunjukkan reduksi aljabar finitistik terhadap struktur bilangan bulat: bukan perbandingan himpunan tak terhingga.
