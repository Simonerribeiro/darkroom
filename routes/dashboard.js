async function uploadVideoToCloudinary(file, callTypeId) {
  const CLOUD_NAME = 'di0u5vsaq';
  const UPLOAD_PRESET = 'darkroom_videos';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('resource_type', 'video');

  // Mostra barra de progresso
  const progressBar = document.getElementById('upload-progress');
  const progressText = document.getElementById('upload-percent');
  if (progressBar) progressBar.style.display = 'block';

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        if (progressBar) progressBar.value = percent;
        if (progressText) progressText.textContent = percent + '%';
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        const videoUrl = result.secure_url;
        const publicId = result.public_id;

        // Agora salva a URL no banco via servidor
        try {
          const saveRes = await fetch('/dashboard/save-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callTypeId, videoUrl, publicId })
          });
          const saveData = await saveRes.json();
          if (saveData.success) {
            resolve(videoUrl);
          } else {
            reject(new Error('Erro ao salvar vídeo no banco'));
          }
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error('Erro no upload: ' + xhr.status + ' - ' + xhr.responseText));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Falha de rede no upload')));

    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);
    xhr.send(formData);
  });
}
