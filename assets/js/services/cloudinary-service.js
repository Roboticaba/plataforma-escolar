const DEFAULT_CLOUD_NAME = "dflo5rpxy";
const DEFAULT_UPLOAD_PRESET = "alunos_upload";

function getCloudinaryConfig() {
  return {
    cloudName: window.CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUD_NAME,
    uploadPreset: window.CLOUDINARY_UPLOAD_PRESET || DEFAULT_UPLOAD_PRESET
  };
}

export async function uploadImagemCloudinary(file) {
  if (!file) {
    throw new Error("Nenhum arquivo enviado para upload.");
  }

  const { cloudName, uploadPreset } = getCloudinaryConfig();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData
  });

  const data = await response.json();

  if (!response.ok || !data.secure_url) {
    throw new Error(data?.error?.message || "Erro ao enviar imagem para o Cloudinary.");
  }

  return data.secure_url;
}

export async function uploadMultiplasImagensCloudinary(files = []) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) {
    return [];
  }

  return Promise.all(list.map(uploadImagemCloudinary));
}
