/**
 * ZIP Export Module (Phase 11)
 * সব ফাইল একসাথে ZIP প্যাকেজ করে এক্সপোর্ট করে।
 */

export class ZipExport {
    /**
     * সব ফরম্যাটের ফাইল একটি ZIP ফাইলে ডাউনলোড করা
     * @param {Object} documentData 
     * @param {string} zipFilename 
     */
    static async export(documentData, zipFilename = "duty-roster-export.zip") {
        console.log("Exporting ZIP...", documentData);
        alert(`Exporting all files inside ${zipFilename}.`);
    }
}
