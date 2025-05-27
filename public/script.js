const DB_NAME = 'ImageGalleryDB';
const STORE_NAME = 'images';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllImagesFromDB() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteImageFromDB(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.objectStore(STORE_NAME).delete(id);
  return tx.complete;
}

// Helper to compute dimensions based on aspect ratio
function getDimensions(aspect, baseWidth = 1024) {
  const [w, h] = aspect.split(':').map(Number);
  const height = Math.floor((baseWidth * h) / w);
  return { width: baseWidth, height };
}

const { createApp } = Vue;

createApp({
  data() {
    return {
      prompt: '',
      quantity: 1,
      images: [],
      selectedImageIndex: 0,
      loading: false,
      showAspectDropdown: false,
      aspectOptions: ['1:1', '4:3', '3:4',"16:9","9:16"],
      selectedAspect: '1:1',
      // State for editing. When editingImageSeed is non-null, we know we're in edit mode.
      editingImageSeed: null,
    };
  },
  computed: {
    featuredImage() {
      return this.images[this.selectedImageIndex]?.src || '';
    }
  },
  async mounted() {
    try {
      const storedImages = await getAllImagesFromDB();
      if (Array.isArray(storedImages) && storedImages.length > 0) {
        this.images = storedImages;
        this.selectedImageIndex = storedImages.length - 1;
      }
    } catch (error) {
      console.error('Failed to load images on mount:', error);
    }
    window.addEventListener('keydown', this.handleKeyNavigation);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleKeyNavigation);
  },
  methods: {
    handleEnter(event) {
      if (!event.shiftKey) {
        this.submitForm();
      }
    },
    async submitForm() {
      this.loading = true;
      const currentPrompt = this.prompt;
      // Calculate dimensions based on aspect ratio
      const { width, height } = getDimensions(this.selectedAspect);

      if (this.editingImageSeed !== null) {
        // Edit mode: update the current image rather than adding a new one.
        console.log('Editing image using stored seed:', this.editingImageSeed);
        try {
          const response = await fetch('http://pdtscience2:9360/generate', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              prompt: currentPrompt,
              width,
              height,
              num_inference_steps: 4,
              seed: this.editingImageSeed
            })
          });

          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('image/png')) {
            const blob = await response.blob();
            const reader = new FileReader();

            await new Promise(resolve => {
              reader.onloadend = async () => {
                console.log('FileReader finished for edit mode.');
                const updatedImage = {
                  ...this.images[this.selectedImageIndex],
                  src: reader.result,
                  prompt: currentPrompt,
                  seed: this.editingImageSeed
                };

                const db = await openDB();
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.put(updatedImage);

                request.onsuccess = () => {
                  this.images[this.selectedImageIndex] = updatedImage;
                  console.log('Image updated with ID:', updatedImage.id);
                  resolve();
                };

                request.onerror = () => {
                  console.error('Failed to update image in IndexedDB', request.error);
                  resolve();
                };
              };
              reader.readAsDataURL(blob);
            });
          } else if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.warn('⚠️ JSON Response during editing:', data);
          } else {
            console.error('❌ Unexpected content type during editing:', contentType);
          }
        } catch (error) {
          console.error('Error during editing:', error);
        }
        // Clear editing state after updating
        this.editingImageSeed = null;
        this.prompt = '';
      } else {
        // Normal generation mode - create new images equal to quantity
        for (let i = 0; i < this.quantity; i++) {
          const seed = Math.floor(Math.random() * 4294967296);
          console.log('Normal generation mode, seed:', seed);
          try {
            const response = await fetch('http://pdtscience2:9360/generate', {
              method: 'POST',
              headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                prompt: currentPrompt,
                width,
                height,
                num_inference_steps: 4,
                seed: seed
              })
            });

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('image/png')) {
              const blob = await response.blob();
              const reader = new FileReader();

              await new Promise(resolve => {
                reader.onloadend = async () => {
                  console.log('FileReader finished for normal generation.');
                  const image = {
                    src: reader.result,
                    prompt: currentPrompt,
                    seed: seed
                  };

                  const db = await openDB();
                  const tx = db.transaction(STORE_NAME, 'readwrite');
                  const store = tx.objectStore(STORE_NAME);
                  const request = store.add(image);

                  request.onsuccess = () => {
                    image.id = request.result;
                    this.images.push(image);
                    this.selectedImageIndex = this.images.length - 1;
                    console.log('New image saved with ID:', image.id);
                    resolve();
                  };

                  request.onerror = () => {
                    console.error('Failed to save new image to IndexedDB', request.error);
                    resolve();
                  };
                };
                reader.readAsDataURL(blob);
              });
            } else if (contentType && contentType.includes('application/json')) {
              const data = await response.json();
              console.warn('⚠️ JSON Response:', data);
            } else {
              console.error('❌ Unexpected content type in normal mode:', contentType);
            }
          } catch (error) {
            console.error('Error generating image:', error);
          }
        }
        this.prompt = '';
      }
      this.loading = false;
    },
    selectImage(image, index) {
      this.selectedImageIndex = index;
    },
    toggleAspectDropdown() {
      this.showAspectDropdown = !this.showAspectDropdown;
    },
    selectAspect(aspect) {
      this.selectedAspect = aspect;
      this.showAspectDropdown = false;
    },
    handleKeyNavigation(event) {
      if (!this.images.length) return;
      let newIndex = this.selectedImageIndex;
      if (event.key === 'ArrowRight') {
        newIndex = (newIndex + 1) % this.images.length;
      } else if (event.key === 'ArrowLeft') {
        newIndex = (newIndex - 1 + this.images.length) % this.images.length;
      }
      if (this.images[newIndex]) {
        this.selectedImageIndex = newIndex;
      }
    },
    async retryImage() {
      const image = this.images[this.selectedImageIndex];
      if (!image || !image.prompt || !image.id) return;

      this.loading = true;
      const currentPrompt = image.prompt;
      const seed = Math.floor(Math.random() * 4294967296);
      const { width, height } = getDimensions(this.selectedAspect);

      console.log('Retrying image with seed:', seed);
      try {
        const response = await fetch('http://pdtscience2:9360/generate', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: currentPrompt,
            width,
            height,
            num_inference_steps: 4,
            seed: seed
          })
        });

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('image/png')) {
          const blob = await response.blob();
          const reader = new FileReader();

          await new Promise(resolve => {
            reader.onloadend = async () => {
              const updatedImage = {
                id: image.id,
                src: reader.result,
                prompt: currentPrompt,
                seed: image.seed
              };

              const db = await openDB();
              const tx = db.transaction(STORE_NAME, 'readwrite');
              const store = tx.objectStore(STORE_NAME);
              const request = store.put(updatedImage);

              request.onsuccess = () => {
                this.images[this.selectedImageIndex] = updatedImage;
                console.log('Retry image updated in IndexedDB.');
                resolve();
              };

              request.onerror = () => {
                console.error('Failed to update image in IndexedDB', request.error);
                resolve();
              };
            };
            reader.readAsDataURL(blob);
          });
        } else if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.warn('⚠️ JSON Response during retry:', data);
        } else {
          console.error('❌ Unexpected content type during retry:', contentType);
        }
      } catch (error) {
        console.error('Error during image retry:', error);
      }
      this.loading = false;
    },
    copyPrompt() {
  if (
    this.selectedImageIndex !== null &&
    this.images[this.selectedImageIndex] &&
    this.images[this.selectedImageIndex].prompt
  ) {
    const promptText = this.images[this.selectedImageIndex].prompt;
    navigator.clipboard.writeText(promptText)
      .then(() => {
        console.log("Prompt copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy prompt:", err);
      });
  } else {
    console.warn("No image selected or no prompt available.");
  }
},

    editImage() {
      const image = this.images[this.selectedImageIndex];
      if (!image || !image.prompt || !image.id) return;
      // Populate the prompt and set editing mode with the current image's seed.
      this.prompt = image.prompt;
      this.editingImageSeed = image.seed;
      console.log('Entering edit mode:', { prompt: this.prompt, seed: this.editingImageSeed });
    },
    downloadImage() {
      const image = this.images[this.selectedImageIndex];
      if (!image) return;
      fetch(image.src)
        .then(response => response.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `image-${this.selectedImageIndex + 1}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        })
        .catch(error => {
          console.error('Download failed:', error);
        });
    },
    async deleteImage() {
      const image = this.images[this.selectedImageIndex];
      if (!image || !image.id) return;
      await deleteImageFromDB(image.id);
      this.images.splice(this.selectedImageIndex, 1);
      if (this.images.length > 0) {
        this.selectedImageIndex = Math.max(0, this.selectedImageIndex - 1);
      } else {
        this.selectedImageIndex = 0;
      }
    }
  }
}).mount('#app');
