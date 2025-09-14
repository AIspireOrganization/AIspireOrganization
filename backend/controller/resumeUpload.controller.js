import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import { deleteFile } from "../utils/deleteFile.js";
import ResumeData from "../models/resumeData.model.js";
import { v2 as cloudinary } from 'cloudinary';

export const uploadResume = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file provided" });
  }

  const userId = req.user._id;
  const filePath = req.file.path;

  try {
    const flaskForm = new FormData();
    flaskForm.append("file", fs.createReadStream(filePath), req.file.originalname);

    const flaskUrl = "http://127.0.0.1:3000/parse-resume";
    const { data } = await axios.post(flaskUrl, flaskForm, {
      headers: flaskForm.getHeaders(),
    });

    if (!data.resume_data) {
      deleteFile(filePath);
      return res.status(400).json({ message: "Parsing Resume Failed!" });
    }

    const resume_data = JSON.parse(data.resume_data);

    const resumeReview_data = await axios.post(
      "http://127.0.0.1:3000/summarize",
      {resume_data},
    );

    if(!resumeReview_data.data){
      deleteFile(filePath);
      return res.status(400).json({ message: "Parsing Resume Failed!" });
    }

    const resumeReview = resumeReview_data.data.summary;

    console.log(resumeReview);

    const resume_embedding = await axios.post(
      "http://127.0.0.1:5000/embed_candidate",
      {summary : resumeReview},
    );

    if(!resume_embedding.data.embedding){
      return res.status(501).json({message: "resume embedding failed"});
    }

    console.log(resume_embedding.data);

    const embedding = resume_embedding.data.embedding;

    const timestamp = Math.floor(Date.now() / 1000);

    const paramsToSign = {
      timestamp,
      upload_preset: "ml_default",
      access_mode: "public",
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    const cloudForm = new FormData();
    cloudForm.append("file", fs.createReadStream(filePath));
    cloudForm.append("api_key", process.env.CLOUDINARY_API_KEY);
    cloudForm.append("timestamp", timestamp);
    cloudForm.append("access_mode", "public");
    cloudForm.append("upload_preset", "ml_default");
    cloudForm.append("signature", signature);
    cloudForm.append("resource_type", "auto"); 


    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`;

    const cloudinaryRes = await axios.post(cloudinaryUrl, cloudForm, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    const newResume = await ResumeData.findOneAndUpdate(
      { userId },
      {
        resumeLink: cloudinaryRes.data.secure_url,
        resumeJSONdata: resume_data,
        resumeReview: resumeReview,
        embedding: embedding
      },
      { new: true, upsert: true }
    ).select("-embedding");

    deleteFile(filePath);

    return res.status(200).json({
      message: "Resume Uploaded Successfully",
      newResume,
    });

  } catch (err) {
    console.error("Error in uploadResume:", err.response?.data || err.message);
    deleteFile(filePath);
    return res.status(400).json({ message: "Server Error" });
  }
};


export const getResumeData = async (req, res) => {

  const userId = req.user._id;

  try{

    const resume_data = await ResumeData.findOne({userId : userId});

    // const resumeString = JSON.stringify(resume_data.resumeJSONdata, null, 2);
    // console.log(resumeString);

    return res.status(200).json({resume_data, message: "Resume data fetched successfully!"});

  }catch(err){
    console.log(err);
  }
}


































